"""Скрытая панель разработчика (/api/dev/*).

Безопасность:
- Пароль берётся ТОЛЬКО из переменной окружения DEV_PANEL_PASSWORD.
- Если пароль не задан — панель полностью выключена (всё отвечает 404).
- Сравнение пароля и токена — timing-safe (hmac.compare_digest).
- Любая ошибка авторизации возвращает 404 (а не 401/403), чтобы панель
  нельзя было обнаружить перебором.
- Защита от перебора: 5 неверных попыток с одного IP → блок на 15 минут.
"""

import hmac
import time
import hashlib
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.models import (
    Group, Lesson, Teacher, Room, WeekSchedule, SyncLog,
    UserRegistration, UserSubscription, TeacherOverride,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dev", tags=["dev"])

TOKEN_TTL = 24 * 3600           # 24 часа
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60       # 15 минут

# IP -> {"fails": int, "until": epoch}
_attempts: dict = {}
NOT_FOUND = HTTPException(status_code=404, detail="Not Found")


# ── Авторизация ──────────────────────────────────────────────────────────
def _password() -> str:
    return settings.DEV_PANEL_PASSWORD or ""


def _check_password(provided: str) -> bool:
    pw = _password()
    if not pw or not provided:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), pw.encode("utf-8"))


def _make_token() -> str:
    exp = str(int(time.time()) + TOKEN_TTL)
    sig = hmac.new(_password().encode(), exp.encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def _verify_token(token: str) -> bool:
    pw = _password()
    if not pw or not token or "." not in token:
        return False
    exp_s, _, sig = token.partition(".")
    if not exp_s.isdigit() or int(exp_s) < time.time():
        return False
    expected = hmac.new(pw.encode(), exp_s.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_locked(ip: str) -> bool:
    rec = _attempts.get(ip)
    return bool(rec and rec.get("until", 0) > time.time())


def _record_fail(ip: str) -> None:
    rec = _attempts.get(ip) or {"fails": 0, "until": 0}
    rec["fails"] += 1
    if rec["fails"] >= MAX_ATTEMPTS:
        rec["until"] = time.time() + LOCKOUT_SECONDS
        rec["fails"] = 0
    _attempts[ip] = rec


def _reset_fails(ip: str) -> None:
    _attempts.pop(ip, None)


# Имя владельца: ссылку на панель на сайте видит только он, и только на его
# устройства уходит «Тестовый push» (раньше — всем студентам). Защита панели
# от этого не зависит — она по-прежнему только в пароле.
OWNER_NAMES = {"сухроб", "suhrob"}


def is_owner_name(name: Optional[str]) -> bool:
    first = (name or "").strip().split()
    return bool(first) and first[0].lower() in OWNER_NAMES


def require_dev(x_dev_token: str = Header(default="")) -> None:
    """Зависимость для защищённых маршрутов. Невалидный токен → 404."""
    if not _verify_token(x_dev_token):
        raise NOT_FOUND


# ── Логин ────────────────────────────────────────────────────────────────
class LoginBody(BaseModel):
    password: str


@router.post("/login")
def dev_login(body: LoginBody, request: Request):
    """Проверка пароля. Возвращает токен на 24 часа или 404 (неверно/блок/выкл)."""
    ip = _client_ip(request)
    if not _password() or _is_locked(ip):
        raise NOT_FOUND
    if not _check_password(body.password):
        _record_fail(ip)
        raise NOT_FOUND
    _reset_fails(ip)
    return {"token": _make_token(), "expires_in": TOKEN_TTL}


# ── Обзор: синхронизация и данные ────────────────────────────────────────
def _latest_week_ids(db: Session) -> list[int]:
    ids = []
    for fcode in ["ЕНФ", "ГФ"]:
        w = (
            db.query(WeekSchedule)
            .filter_by(faculty_code=fcode, is_latest=True)
            .order_by(WeekSchedule.downloaded_at.desc())
            .first()
        )
        if w:
            ids.append(w.id)
    return ids


@router.get("/overview", dependencies=[Depends(require_dev)])
def dev_overview(db: Session = Depends(get_db)):
    week_ids = _latest_week_ids(db)

    # Группы с нулём занятий на текущей неделе
    groups = db.query(Group).join(Group.faculty).all()
    lesson_counts = dict(
        db.query(Lesson.group_id, func.count(Lesson.id))
        .filter(Lesson.week_schedule_id.in_(week_ids))
        .group_by(Lesson.group_id)
        .all()
    ) if week_ids else {}
    zero_groups = [
        {
            "id": g.id,
            "name": g.name,
            "year": g.year,
            "faculty": g.faculty.code if g.faculty else None,
        }
        for g in groups
        if lesson_counts.get(g.id, 0) == 0
    ]

    last_sync = db.query(SyncLog).order_by(SyncLog.started_at.desc()).first()
    logs = db.query(SyncLog).order_by(SyncLog.started_at.desc()).limit(10).all()

    return {
        "counts": {
            "groups": db.query(Group).count(),
            "lessons_current_week": sum(lesson_counts.values()),
            "lessons_total": db.query(Lesson).count(),
            "teachers": db.query(Teacher).count(),
            "rooms": db.query(Room).count(),
            "weeks": db.query(WeekSchedule).count(),
        },
        "last_sync": None if not last_sync else {
            "status": last_sync.status,
            "message": last_sync.message,
            "faculty": last_sync.faculty_code,
            "started_at": last_sync.started_at.isoformat() if last_sync.started_at else None,
            "finished_at": last_sync.finished_at.isoformat() if last_sync.finished_at else None,
        },
        "zero_lesson_groups": zero_groups,
        "sync_logs": [
            {
                "status": s.status,
                "faculty": s.faculty_code,
                "message": s.message,
                "changes": s.changes_count,
                "started_at": s.started_at.isoformat() if s.started_at else None,
            }
            for s in logs
        ],
    }


# ── Преподаватели, которых нет во вкладке «Педагоги» ─────────────────────
@router.get("/missing-teachers", dependencies=[Depends(require_dev)])
def dev_missing_teachers(db: Session = Depends(get_db)):
    """Кто ведёт пары на этой и следующей неделе, но не попадает в список
    педагогов: в файле msu.tj вместо «Фамилия И.О.» стоит код кафедры или имя
    без инициалов («Шодибеки Сафар»), а /schedule/teachers берёт только ФИО с
    инициалами (is_real_teacher_name). Лечится заменой ФИО в панели.

    Пропускаем пары, где «преподаватель» совпадает с предметом («НИР» / «НИР»):
    это не человек, а вид занятия."""
    from app.api.routes.schedule import is_real_teacher_name, dushanbe_today
    from app.services.parser import override_teacher_name

    monday = dushanbe_today() - timedelta(days=dushanbe_today().weekday())
    wanted = {monday, monday + timedelta(days=7)}
    week_ids = []
    for fcode in ["ЕНФ", "ГФ"]:
        for ws in wanted:
            w = (
                db.query(WeekSchedule)
                .filter(WeekSchedule.faculty_code == fcode, WeekSchedule.week_start == ws)
                .order_by(WeekSchedule.downloaded_at.desc())
                .first()
            )
            if w:
                week_ids.append(w.id)
    if not week_ids:
        return []

    rows: dict = {}
    lessons = (
        db.query(Lesson)
        .join(Lesson.teacher)
        .filter(Lesson.week_schedule_id.in_(week_ids))
        .all()
    )
    for l in lessons:
        name = l.teacher.name
        if not name or is_real_teacher_name(name):
            continue
        if name.strip().lower() == (l.subject or "").strip().lower():
            continue
        key = (l.subject, name)
        r = rows.setdefault(key, {
            "subject": l.subject, "teacher": name, "lessons": 0, "groups": set(),
            # Замена уже есть, но пары ещё записаны со старым именем — её
            # подхватит следующая запись недели («Проверить msu.tj сейчас»).
            "override": override_teacher_name(l.subject, name),
        })
        r["lessons"] += 1
        if l.group:
            r["groups"].add(f"{l.group.year} курс · {l.group.name}")

    out = [{**r, "groups": sorted(r["groups"])} for r in rows.values()]
    return sorted(out, key=lambda r: (r["override"] is not None, -r["lessons"]))


# ── Полные имена преподавателей (services/full_names.py) ─────────────────
@router.get("/full-names", dependencies=[Depends(require_dev)])
def dev_full_names(db: Session = Depends(get_db)):
    from app.services.full_names import admin_overview
    return admin_overview(db)


class FullNameBody(BaseModel):
    teacher: str
    full_name: Optional[str] = None   # пусто — убрать утверждённое имя


def _names_call(fn):
    from app.services.full_names import VoteError
    try:
        fn()
    except VoteError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.post("/full-names/variants/{variant_id}/approve", dependencies=[Depends(require_dev)])
def dev_variant_approve(variant_id: int, db: Session = Depends(get_db)):
    from app.services.full_names import set_variant_status
    return _names_call(lambda: set_variant_status(db, variant_id, "open"))


@router.post("/full-names/variants/{variant_id}/reject", dependencies=[Depends(require_dev)])
def dev_variant_reject(variant_id: int, db: Session = Depends(get_db)):
    from app.services.full_names import set_variant_status
    return _names_call(lambda: set_variant_status(db, variant_id, "rejected"))


@router.post("/full-names/variants/{variant_id}/merge/{into_id}", dependencies=[Depends(require_dev)])
def dev_variant_merge(variant_id: int, into_id: int, db: Session = Depends(get_db)):
    from app.services.full_names import merge_variant
    return _names_call(lambda: merge_variant(db, variant_id, into_id))


@router.post("/full-names/final", dependencies=[Depends(require_dev)])
def dev_full_name_final(body: FullNameBody, db: Session = Depends(get_db)):
    from app.services.full_names import set_final
    return _names_call(lambda: set_final(db, body.teacher.strip(), (body.full_name or "").strip() or None))


# ── Ручные действия ──────────────────────────────────────────────────────
@router.post("/sync", dependencies=[Depends(require_dev)])
async def dev_sync():
    from app.services.sync import sync_all
    results = await sync_all(force=True)
    return {"results": results}


@router.post("/clear-cache", dependencies=[Depends(require_dev)])
def dev_clear_cache():
    from app.api.routes.schedule import clear_free_rooms_cache
    clear_free_rooms_cache()
    return {"ok": True, "message": "Кэш расписания очищен"}


@router.post("/rebuild-rooms", dependencies=[Depends(require_dev)])
def dev_rebuild_rooms():
    from app.main import seed_rooms
    from app.api.routes.schedule import clear_free_rooms_cache
    seed_rooms()
    clear_free_rooms_cache()
    return {"ok": True, "message": "Аудитории пересобраны (дубли по регистру объединены)"}


# ── Замены ФИО преподавателей ────────────────────────────────────────────
class OverrideBody(BaseModel):
    subject: str
    code: str
    real_name: str


def _reload_overrides(db: Session) -> None:
    from app.services.parser import set_active_overrides
    from app.api.routes.schedule import clear_free_rooms_cache
    rows = db.query(TeacherOverride).all()
    set_active_overrides([(r.subject, r.code, r.real_name) for r in rows])
    # ФИО подставляются при выдаче — и в кэшированные /bulk-sync и /free-rooms
    # тоже. Без сброса правка доходила до приложения только через 10–15 минут.
    clear_free_rooms_cache()


@router.get("/overrides", dependencies=[Depends(require_dev)])
def dev_overrides_list(db: Session = Depends(get_db)):
    rows = db.query(TeacherOverride).order_by(TeacherOverride.subject).all()
    return [
        {"id": r.id, "subject": r.subject, "code": r.code, "real_name": r.real_name}
        for r in rows
    ]


@router.post("/overrides", dependencies=[Depends(require_dev)])
def dev_overrides_upsert(body: OverrideBody, db: Session = Depends(get_db)):
    subject = body.subject.strip().lower()
    code = body.code.strip()
    name = body.real_name.strip()
    if not subject or not code or not name:
        raise HTTPException(400, "Заполните все поля")
    row = db.query(TeacherOverride).filter_by(subject=subject, code=code).first()
    if row:
        row.real_name = name
    else:
        db.add(TeacherOverride(subject=subject, code=code, real_name=name))
    db.commit()
    _reload_overrides(db)
    return {"ok": True}


@router.delete("/overrides/{override_id}", dependencies=[Depends(require_dev)])
def dev_overrides_delete(override_id: int, db: Session = Depends(get_db)):
    row = db.get(TeacherOverride, override_id)
    if row:
        db.delete(row)
        db.commit()
        _reload_overrides(db)
    return {"ok": True}


# ── Производительность ───────────────────────────────────────────────────
@router.get("/performance", dependencies=[Depends(require_dev)])
def dev_performance(db: Session = Depends(get_db)):
    from app.api.routes.schedule import _FREE_ROOMS_CACHE
    from app.core.response_cache import cache_stats
    timings = {}
    # Замеряем время простых операций на стороне сервера
    for name, fn in [
        ("groups", lambda: db.query(Group).count()),
        ("lessons", lambda: db.query(Lesson).count()),
        ("teachers", lambda: db.query(Teacher).count()),
        ("rooms", lambda: db.query(Room).count()),
    ]:
        t0 = time.perf_counter()
        fn()
        timings[name] = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "db_timings_ms": timings,
        "free_rooms_cache": {
            "warm": len(_FREE_ROOMS_CACHE) > 0,
            "entries": len(_FREE_ROOMS_CACHE),
        },
        "response_cache": cache_stats(),
    }


# ── Пользователи и уведомления ───────────────────────────────────────────
@router.get("/users", dependencies=[Depends(require_dev)])
def dev_users(db: Session = Depends(get_db)):
    push_count = (
        db.query(UserSubscription)
        .filter(UserSubscription.push_endpoint.isnot(None))
        .count()
    )
    from app.api.routes.app_update import parse_version

    # Приложение присылает свою версию при каждой отметке, сайт — нет. Так и
    # отличаем: версия есть — человек с приложением.
    by_version = dict(
        db.query(UserRegistration.app_version, func.count(UserRegistration.id))
        .group_by(UserRegistration.app_version)
        .all()
    )
    site_users = by_version.pop(None, 0)
    app_versions = sorted(
        ({"version": v, "count": n} for v, n in by_version.items()),
        key=lambda x: parse_version(x["version"]), reverse=True,
    )
    owner_devices = sum(
        1 for (name,) in db.query(UserRegistration.name).all() if is_owner_name(name)
    )
    return {
        "registered_users": db.query(UserRegistration).count(),
        "app_users": sum(x["count"] for x in app_versions),
        "site_users": site_users,
        "app_versions": app_versions,
        "owner_devices": owner_devices,
        "push_subscribers": push_count,
        "expo_tokens": (
            db.query(UserRegistration)
            .filter(UserRegistration.expo_push_token.isnot(None))
            .count()
        ),
        "vapid_configured": bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY),
    }


@router.post("/test-push", dependencies=[Depends(require_dev)])
def dev_test_push(db: Session = Depends(get_db)):
    """Тестовое уведомление в оба канала — браузер (Web Push) и приложение
    (Expo), но только на устройства владельца (имя «Сухроб» / «Suhrob»).
    До 8 окт 2026 оно уходило всем студентам. Ошибки Expo показываем как есть:
    InvalidCredentials значит, что в Expo не загружен ключ Firebase."""
    from app.services.push import send_push, send_expo_push

    title, body = "Тест", "Проверка уведомлений из панели разработчика"

    owner_regs = [r for r in db.query(UserRegistration).all() if is_owner_name(r.name)]
    owner_ids = [r.device_id for r in owner_regs]

    web_sent, subs = 0, []
    if settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY and owner_ids:
        # На сайте подписка на push заведена под тем же id, что и регистрация
        subs = (
            db.query(UserSubscription)
            .filter(UserSubscription.push_endpoint.isnot(None),
                    UserSubscription.session_id.in_(owner_ids))
            .all()
        )
        for s in subs:
            try:
                if send_push(s.push_endpoint, s.push_keys, title, body):
                    web_sent += 1
            except Exception:
                pass

    tokens = [r.expo_push_token for r in owner_regs if r.expo_push_token]
    expo = send_expo_push(db, tokens, title, body) if tokens else {"sent": 0, "errors": []}

    if not owner_ids:
        return {"message": "Нет ни одного устройства с именем «Сухроб» или «Suhrob» — "
                           "впишите это имя в Кабинете приложения или сайта",
                "sent": 0, "total": 0, "expo": {"sent": 0, "total": 0, "errors": []}}
    web_part = (f"сайт {web_sent} из {len(subs)}"
                if settings.VAPID_PUBLIC_KEY else "сайт: VAPID-ключи не настроены")
    expo_part = f"приложение {expo['sent']} из {len(tokens)}"
    if expo["errors"]:
        expo_part += f" (ошибки: {', '.join(sorted(set(expo['errors'])))})"
    return {
        "message": f"Отправлено на ваши устройства: {web_part}; {expo_part}",
        "sent": web_sent,
        "total": len(subs),
        "expo": {"sent": expo["sent"], "total": len(tokens), "errors": sorted(set(expo["errors"]))},
    }


# ── Просмотр сырых данных ────────────────────────────────────────────────
@router.get("/raw", dependencies=[Depends(require_dev)])
def dev_raw(group_id: int, week_start: Optional[str] = None, db: Session = Depends(get_db)):
    from app.api.routes.schedule import enrich_lesson
    from sqlalchemy.orm import joinedload

    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    if week_start:
        try:
            ws = date.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(400, "Неверная дата")
        wk = (
            db.query(WeekSchedule)
            .filter(WeekSchedule.faculty_code == group.faculty.code, WeekSchedule.week_start == ws)
            .order_by(WeekSchedule.downloaded_at.desc())
            .first()
        )
    else:
        wk = (
            db.query(WeekSchedule)
            .filter_by(faculty_code=group.faculty.code, is_latest=True)
            .order_by(WeekSchedule.downloaded_at.desc())
            .first()
        )
    if not wk:
        return {"group": group.name, "week": None, "lessons": []}

    lessons = (
        db.query(Lesson)
        .options(joinedload(Lesson.teacher), joinedload(Lesson.room),
                 joinedload(Lesson.group).joinedload(Group.faculty))
        .filter(Lesson.week_schedule_id == wk.id, Lesson.group_id == group_id)
        .all()
    )
    return {
        "group": group.name,
        "year": group.year,
        "faculty": group.faculty.code if group.faculty else None,
        "week_start": str(wk.week_start),
        "week_number": wk.week_number,
        # API-вывод идентичен тому, что показывает мобильное приложение и сайт
        "lessons": [enrich_lesson(l) for l in lessons],
    }
