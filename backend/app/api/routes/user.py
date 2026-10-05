"""Регистрация пользователя, push-токены и подписки.

Эндпоинты заметок и посещаемости (/user/notes, /user/attendance) удалены 5 окт
2026: клиенты их не вызывали с июня (пропуски и заметки хранятся только на
устройстве), а публичная запись в attendance_records в Postgres ломала чистку
архива. Таблицы lesson_notes и attendance_records остались — их не трогаем."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
import json

from app.database import get_db
from app.models import Group, UserSubscription, UserRegistration
from app.core.config import settings

router = APIRouter(prefix="/user", tags=["user"])


@router.post("/register")
def register_user(
    device_id: str,
    name: str,
    group_id: int,
    background_tasks: BackgroundTasks,
    silent: bool = False,
    app_version: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Сохраняет или обновляет регистрацию пользователя (имя + группа).

    silent=1 — тихая перерегистрация: клиенты присылают её сами при запуске и
    возврате в приложение. База на Render стирается при каждом деплое бэкенда,
    и без этого сервер забывал всех пользователей и их push-токены. Письмо
    владельцу в этом режиме не отправляется — иначе после каждого деплоя
    пришло бы по письму «новый пользователь» на каждого студента."""
    from app.services.email import send_registration_email

    # Postgres, в отличие от SQLite, не обрезает строку длиннее колонки, а
    # падает с ошибкой 500. Имя обрезаем, а слишком длинный id отклоняем.
    if len(device_id) > 100:
        raise HTTPException(400, "Слишком длинный device_id")
    name = name.strip()[:200]

    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    group_label = f"{group.year} курс · {group.name}"
    reg = db.query(UserRegistration).filter_by(device_id=device_id).first()
    is_new = reg is None

    if reg:
        reg.name = name.strip()
        reg.group_id = group_id
    else:
        reg = UserRegistration(device_id=device_id, name=name.strip(), group_id=group_id)
        db.add(reg)
    if app_version:
        reg.app_version = app_version[:20]
    db.commit()

    # Письмо — только при первой регистрации И только если такой же name+group_id ещё нет
    # (один человек с разных браузеров не должен слать дубли)
    if is_new and not silent:
        duplicate = db.query(UserRegistration).filter(
            UserRegistration.name == name.strip(),
            UserRegistration.group_id == group_id,
            UserRegistration.device_id != device_id,
        ).first()
        if not duplicate:
            background_tasks.add_task(send_registration_email, name.strip() or "Аноним", group_label)

    return {"ok": True}


@router.post("/push-token")
def set_push_token(device_id: str, token: str, app_version: Optional[str] = None,
                   db: Session = Depends(get_db)):
    """Сохраняет Expo push-токен устройства — для мгновенных уведомлений об
    изменении расписания СВОЕЙ группы (см. notify_group_changes в services/push.py).

    Обновляется чаще, чем регистрация: токен может смениться (переустановка,
    сброс данных приложения), а разрешение на уведомления могут дать не сразу
    при онбординге, а позже, из кабинета. Поэтому отдельный эндпоинт, а не
    ещё один параметр в /register.
    """
    if len(token) > 200:
        raise HTTPException(400, "Слишком длинный токен")
    reg = db.query(UserRegistration).filter_by(device_id=device_id).first()
    if not reg:
        # Регистрации ещё нет (не должно случаться при обычном порядке экранов,
        # но лучше тихо промолчать, чем уронить клиент 404-й) — токен просто
        # пропадает, приложение попробует прислать его снова при следующем запуске.
        return {"ok": False}
    reg.expo_push_token = token
    if app_version:
        reg.app_version = app_version[:20]
    db.commit()
    return {"ok": True}


@router.post("/subscribe")
def subscribe(
    session_id: str,
    group_id: int,
    db: Session = Depends(get_db),
):
    """Подписаться на расписание группы."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    sub = db.query(UserSubscription).filter_by(session_id=session_id).first()
    if sub:
        sub.group_id = group_id
    else:
        sub = UserSubscription(session_id=session_id, group_id=group_id)
        db.add(sub)

    db.commit()
    return {"ok": True, "group_id": group_id, "group_name": group.name}


@router.get("/subscription/{session_id}")
def get_subscription(session_id: str, db: Session = Depends(get_db)):
    """Получить текущую подписку пользователя."""
    sub = db.query(UserSubscription).filter_by(session_id=session_id).first()
    if not sub or not sub.group_id:
        return None
    group = db.get(Group, sub.group_id)
    return {
        "group_id": sub.group_id,
        "group_name": group.name if group else None,
        "year": group.year if group else None,
    }


@router.get("/vapid-key")
def get_vapid_key():
    """Возвращает публичный VAPID-ключ для Web Push подписки.

    Если ключи не настроены — отдаём 200 с public_key=null (а не 503),
    чтобы клиент тихо скрыл пуш-кнопку без ошибок в консоли/сети."""
    return {"public_key": settings.VAPID_PUBLIC_KEY or None}


class PushSubscriptionBody(BaseModel):
    session_id: str
    group_id: int
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}


@router.post("/push-subscribe")
def push_subscribe(body: PushSubscriptionBody, db: Session = Depends(get_db)):
    """Сохраняет Web Push подписку пользователя."""
    group = db.get(Group, body.group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    sub = db.query(UserSubscription).filter_by(session_id=body.session_id).first()
    if sub:
        sub.group_id = body.group_id
        sub.push_endpoint = body.endpoint
        sub.push_keys = json.dumps(body.keys)
    else:
        sub = UserSubscription(
            session_id=body.session_id,
            group_id=body.group_id,
            push_endpoint=body.endpoint,
            push_keys=json.dumps(body.keys),
        )
        db.add(sub)
    db.commit()
    return {"ok": True}


@router.delete("/push-subscribe")
def push_unsubscribe(session_id: str, db: Session = Depends(get_db)):
    """Удаляет Web Push подписку (пользователь отключил уведомления)."""
    sub = db.query(UserSubscription).filter_by(session_id=session_id).first()
    if sub:
        sub.push_endpoint = None
        sub.push_keys = None
        db.commit()
    return {"ok": True}
