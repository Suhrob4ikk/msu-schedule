"""Отправка push-уведомлений: изменения расписания + напоминания о зачётах/экзаменах.

Два независимых канала на разные аудитории:
- Web Push (pywebpush, VAPID) — браузеры, подписавшиеся на сайте.
- Expo Push (send_expo_push) — мобильное приложение. Отдельный канал, потому что
  протоколы несовместимы: браузер понимает Web Push, Android-приложение — нет
  (у него нет service worker'а), а у Expo — свой шлюз до FCM/APNs.
"""

import json
import logging
from datetime import date, timedelta
from typing import Optional
import httpx
from pywebpush import webpush, WebPushException

from app.core.config import settings

logger = logging.getLogger(__name__)

# Ключевые слова для определения зачёта / экзамена
EXAM_KEYWORDS = {"зачет", "зачёт", "экзамен", "экз"}

# Смещение дня недели от понедельника
DAY_OFFSETS: dict[str, int] = {
    "понедельник": 0, "вторник": 1, "среда": 2, "четверг": 3,
    "пятница": 4, "суббота": 5, "воскресенье": 6,
}

# Время начала пары (для текста уведомления)
PAIR_START: dict[str, str] = {
    "I": "08:00", "II": "09:45", "III": "11:30", "IV": "14:00", "V": "15:45",
}


def _is_exam(lesson) -> bool:
    lt = (lesson.lesson_type or "").lower()
    subj = lesson.subject.lower()
    return any(kw in lt or kw in subj for kw in EXAM_KEYWORDS)


def _exam_date(lesson, week_start) -> date:
    """Возвращает дату экзамена: берёт lesson_date если есть, иначе считает по week_start."""
    if lesson.lesson_date:
        return lesson.lesson_date
    ws = week_start if isinstance(week_start, date) else date.fromisoformat(str(week_start))
    return ws + timedelta(days=DAY_OFFSETS.get(lesson.day_of_week, 0))


def _day_label(lesson) -> str:
    day = lesson.day_of_week.capitalize()
    time = PAIR_START.get(lesson.pair_number, "")
    return f"{day}{f' в {time}' if time else ''}"


def send_push(endpoint: str, keys_json: str, title: str, body: str,
              url: str = "/", notif_type: str = "general", exam_key: str = "") -> bool:
    """Отправляет одно push-уведомление. True — ушло успешно.

    Возвращаемое значение важно для панели /dev: раньше функция была `-> None`,
    и счётчик «Тестовый push» всегда показывал 0, хотя уведомления доходили."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return False
    try:
        keys = json.loads(keys_json)
        payload = {"title": title, "body": body, "url": url, "type": notif_type}
        if exam_key:
            payload["exam_key"] = exam_key
        webpush(
            subscription_info={"endpoint": endpoint, "keys": keys},
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
        )
        return True
    except WebPushException as e:
        if e.response and e.response.status_code in (404, 410):
            raise  # вызывающий код удалит протухшую подписку
        logger.warning(f"Push ошибка: {e}")
        return False
    except Exception as e:
        logger.warning(f"Push ошибка: {e}")
        return False


# ─── Уведомления об изменениях расписания ─────────────────────────────────────

# Родительный падеж, сокращённо — для «5–10 окт» в уведомлении о новой неделе.
_MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн",
                 "июл", "авг", "сен", "окт", "ноя", "дек"]


def week_range_label(week_start: date) -> str:
    """«5–10 окт» — учебная неделя пн–сб. Через границу месяца: «28 сен – 3 окт»."""
    end = week_start + timedelta(days=5)
    if end.month == week_start.month:
        return f"{week_start.day}–{end.day} {_MONTHS_SHORT[end.month - 1]}"
    return (f"{week_start.day} {_MONTHS_SHORT[week_start.month - 1]} – "
            f"{end.day} {_MONTHS_SHORT[end.month - 1]}")


def _notify_groups(db, group_ids: list[int], title: str, body: str, kind: str) -> dict:
    """Одно и то же уведомление всем подписчикам перечисленных групп — и в
    браузеры (Web Push), и в приложение (Expo). Возвращает, сколько ушло."""
    from app.models import UserSubscription, UserRegistration

    if not group_ids:
        return {"web": 0, "expo": 0}

    subs = db.query(UserSubscription).filter(
        UserSubscription.group_id.in_(group_ids),
        UserSubscription.push_endpoint.isnot(None),
    ).all()

    web_sent = 0
    stale_ids = []
    for sub in subs:
        try:
            if send_push(sub.push_endpoint, sub.push_keys, title, body, "/", notif_type=kind):
                web_sent += 1
        except WebPushException:
            stale_ids.append(sub.id)
        except Exception:
            pass
    _clear_stale(db, stale_ids)
    db.commit()

    # Тот же текст уходит в мобильное приложение — уже не через браузер,
    # а через Expo Push, единственный канал, который может разбудить нативное
    # приложение мгновенно, даже если оно закрыто.
    tokens = [
        r.expo_push_token for r in
        db.query(UserRegistration)
        .filter(
            UserRegistration.group_id.in_(group_ids),
            UserRegistration.expo_push_token.isnot(None),
        )
        .all()
    ]
    expo = send_expo_push(db, tokens, title, body, data={"kind": kind}) if tokens else {"sent": 0}
    return {"web": web_sent, "expo": expo["sent"]}


def notify_group_changes(db, group_id: int, changes_count: int) -> dict:
    """Подписчикам ОДНОЙ группы — изменения внутри текущей недели.

    Раньше группа искалась по названию, а название у всех курсов направления
    одинаковое («ПРИКЛАДНАЯ МАТЕМАТИКА И ИНФОРМАТИКА»): правка у 3 курса
    уходила всем четырём курсам, да ещё с курсом первой попавшейся группы
    в заголовке. Теперь — строго по id."""
    from app.models import Group

    group = db.get(Group, group_id)
    if not group:
        return {"web": 0, "expo": 0}

    label = f"{group.year} курс · {group.name}"
    ending = "изменение" if changes_count == 1 else ("изменения" if changes_count < 5 else "изменений")
    body = f"{changes_count} {ending} в расписании"
    return _notify_groups(db, [group.id], f"Расписание изменилось — {label}", body, "changes")


def notify_new_week(db, faculty_code: str, week_start: date) -> dict:
    """Всем подписчикам групп факультета — «вышло расписание на новую неделю».

    Когда звать — решает save_schedule_to_db (флаг announce_new_week): только
    если в базе уже была более ранняя неделя. Иначе после каждого деплоя
    (база пустая) «новыми» оказались бы все недели разом."""
    from app.models import Group, Faculty

    group_ids = [
        g.id for g in
        db.query(Group).join(Faculty).filter(Faculty.code == faculty_code).all()
    ]
    return _notify_groups(
        db, group_ids,
        "Вышло расписание на новую неделю",
        f"Неделя {week_range_label(week_start)}",
        "new_week",
    )


def send_expo_push(db, tokens: list[str], title: str, body: str,
                   data: Optional[dict] = None) -> dict:
    """Шлёт push через Expo — https://exp.host/--/api/v2/push/send.

    Ничего, кроме токенов, для доставки не нужно: сервер, доставляющий пуш до
    Google, держит Expo. Единственное разовое условие — у проекта в Expo должны
    быть загружены учётные данные Firebase (`eas credentials`), иначе Expo не
    достучится до Google.

    Ответ Expo читаем по каждому токену. Раньше смотрели только на HTTP-код,
    а Expo отвечает 200 даже когда КАЖДОЕ уведомление отклонено (например,
    InvalidCredentials — не загружен ключ Firebase). Ошибка терялась молча.
    Токены с DeviceNotRegistered (приложение удалено) стираем из базы.

    Возвращает {"sent": N, "errors": ["InvalidCredentials", ...]}.
    """
    from app.models import UserRegistration

    result: dict = {"sent": 0, "errors": []}
    # Expo принимает до 100 уведомлений за один запрос
    for i in range(0, len(tokens), 100):
        chunk = tokens[i:i + 100]
        messages = [{"to": t, "title": title, "body": body, "sound": "default",
                     **({"data": data} if data else {})} for t in chunk]
        try:
            r = httpx.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=10,
            )
            r.raise_for_status()
            tickets = r.json().get("data", [])
        except Exception as e:
            logger.warning(f"Expo push не отправился: {e}")
            result["errors"].append(f"запрос не прошёл: {e}")
            continue

        dead = []
        for token, ticket in zip(chunk, tickets):
            if ticket.get("status") == "ok":
                result["sent"] += 1
                continue
            err = (ticket.get("details") or {}).get("error") or ticket.get("message", "?")
            result["errors"].append(err)
            if err == "DeviceNotRegistered":
                dead.append(token)
        if dead:
            for reg in db.query(UserRegistration).filter(UserRegistration.expo_push_token.in_(dead)).all():
                reg.expo_push_token = None
            db.commit()
            from app.api.routes.user import forget_push_tokens
            forget_push_tokens(dead)

    if result["errors"]:
        logger.warning(f"Expo push: ушло {result['sent']} из {len(tokens)}, ошибки: {sorted(set(result['errors']))}")
    return result


# ─── Новая версия приложения ─────────────────────────────────────────────────

# Шлём только про свежий релиз: после деплоя база пустая, и без этого
# ограничения о старом релизе напомнили бы ещё раз спустя недели.
APP_UPDATE_FRESH_DAYS = 3


def notify_app_update(db, version: str, download_url: str) -> dict:
    """Push «Вышла новая версия» всем телефонам, где стоит версия старее.

    Версию телефон сообщает сам (app_version в /user/register и /user/push-token).
    NULL — значит, стоит версия старее 1.9.37, они версию ещё не сообщали.
    Каждому телефону — один раз на версию (таблица app_update_notices).
    Тап по уведомлению открывает ссылку на скачивание (см. app/_layout.tsx).
    """
    from app.models import UserRegistration, AppUpdateNotice
    from app.api.routes.app_update import parse_version

    latest = parse_version(version)
    already = {
        n.device_id for n in
        db.query(AppUpdateNotice).filter(AppUpdateNotice.version == version).all()
    }
    regs = [
        r for r in
        db.query(UserRegistration).filter(UserRegistration.expo_push_token.isnot(None)).all()
        if r.device_id not in already
        and (not r.app_version or parse_version(r.app_version) < latest)
    ]
    if not regs:
        return {"sent": 0, "errors": []}

    result = send_expo_push(
        db, [r.expo_push_token for r in regs],
        "Вышла новая версия",
        f"МГУ Расписание {version} — нажмите, чтобы скачать",
        data={"kind": "app_update", "url": download_url},
    )
    # Отмечаем всех, кому пытались отправить: если Expo отказал по токену,
    # повтор каждые 10 минут ничего не изменит.
    for r in regs:
        db.add(AppUpdateNotice(device_id=r.device_id, version=version))
    db.commit()
    return result


# ─── Уведомления о зачётах / экзаменах ───────────────────────────────────────

def notify_exam_week_ahead(db, week_schedule) -> None:
    """
    Вызывается когда в БД появляется расписание на СЛЕДУЮЩУЮ неделю.
    Отправляет всем подписчикам группы: «На следующей неделе зачёт — готовься!»
    """
    from app.models import UserSubscription, Lesson, ExamNotificationLog

    today = date.today()
    if week_schedule.week_start <= today:
        return  # расписание текущей или прошлой недели — не трогаем

    # Собираем зачёты/экзамены этой недели
    all_lessons = db.query(Lesson).filter_by(week_schedule_id=week_schedule.id).all()
    exam_by_group: dict[int, list] = {}
    for l in all_lessons:
        if _is_exam(l):
            exam_by_group.setdefault(l.group_id, []).append(l)

    if not exam_by_group:
        return

    subs = db.query(UserSubscription).filter(
        UserSubscription.group_id.in_(exam_by_group.keys()),
        UserSubscription.push_endpoint.isnot(None),
    ).all()

    stale_ids = []
    for sub in subs:
        for exam in exam_by_group.get(sub.group_id, []):
            ed = _exam_date(exam, week_schedule.week_start)
            key = f"{sub.session_id}:week_ahead:{ed}:{exam.subject}"

            already = db.query(ExamNotificationLog).filter_by(
                session_id=sub.session_id,
                notification_type="week_ahead",
                exam_date=ed,
                subject=exam.subject,
            ).first()
            if already:
                continue

            is_zachet = any(kw in (exam.lesson_type or exam.subject).lower()
                            for kw in ("зачет", "зачёт"))
            kind = "Зачёт" if is_zachet else "Экзамен"
            title = f"📚 {kind} на следующей неделе"
            body = f"{exam.subject} — {_day_label(exam)}. Успейте подготовиться!"

            try:
                send_push(sub.push_endpoint, sub.push_keys,
                          title, body, "/", notif_type="exam",
                          exam_key=f"week-{ed}-{exam.group_id}")
                db.add(ExamNotificationLog(
                    session_id=sub.session_id,
                    notification_type="week_ahead",
                    group_id=sub.group_id,
                    exam_date=ed,
                    subject=exam.subject,
                ))
            except WebPushException:
                stale_ids.append(sub.id)
            except Exception:
                pass

    _clear_stale(db, stale_ids)
    db.commit()


def send_exam_daily_reminders(db) -> None:
    """
    Ежедневная задача (07:00 по Душанбе):
    - накануне экзамена → «Завтра зачёт, готовься!»
    - в день экзамена  → «Сегодня зачёт — удачи!»
    """
    from app.models import UserSubscription, Lesson, WeekSchedule, ExamNotificationLog

    today = date.today()
    tomorrow = today + timedelta(days=1)

    latest_schedules = db.query(WeekSchedule).filter_by(is_latest=True).all()

    stale_ids = []
    for ws in latest_schedules:
        lessons = db.query(Lesson).filter_by(week_schedule_id=ws.id).all()
        for lesson in lessons:
            if not _is_exam(lesson):
                continue

            ed = _exam_date(lesson, ws.week_start)
            # Раньше заголовок всегда говорил «зачёт» — и про экзамен тоже
            kind = "зачёт" if any(kw in (lesson.lesson_type or lesson.subject).lower()
                                  for kw in ("зачет", "зачёт")) else "экзамен"
            if ed == tomorrow:
                notif_type = "day_before"
                title = f"⏰ Завтра {kind}!"
                time_str = PAIR_START.get(lesson.pair_number, "")
                body = f"{lesson.subject}{f' в {time_str}' if time_str else ''}. Готовьтесь, вы сможете! 💪"
            elif ed == today:
                notif_type = "day_of"
                title = f"🍀 Сегодня {kind}!"
                time_str = PAIR_START.get(lesson.pair_number, "")
                body = f"{lesson.subject}{f' в {time_str}' if time_str else ''}. Удачи вам!"
            else:
                continue

            subs = db.query(UserSubscription).filter(
                UserSubscription.group_id == lesson.group_id,
                UserSubscription.push_endpoint.isnot(None),
            ).all()

            for sub in subs:
                already = db.query(ExamNotificationLog).filter_by(
                    session_id=sub.session_id,
                    notification_type=notif_type,
                    exam_date=ed,
                    subject=lesson.subject,
                ).first()
                if already:
                    continue

                try:
                    send_push(sub.push_endpoint, sub.push_keys,
                              title, body, "/", notif_type="exam",
                              exam_key=f"{notif_type}-{ed}-{lesson.group_id}")
                    db.add(ExamNotificationLog(
                        session_id=sub.session_id,
                        notification_type=notif_type,
                        group_id=sub.group_id,
                        exam_date=ed,
                        subject=lesson.subject,
                    ))
                except WebPushException:
                    stale_ids.append(sub.id)
                except Exception:
                    pass

    _clear_stale(db, stale_ids)
    db.commit()


def _clear_stale(db, stale_ids: list[int]) -> None:
    from app.models import UserSubscription
    for sid in set(stale_ids):
        sub = db.get(UserSubscription, sid)
        if sub:
            sub.push_endpoint = None
            sub.push_keys = None
