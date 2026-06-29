"""Отправка Web Push уведомлений: изменения расписания + напоминания о зачётах/экзаменах."""

import json
import logging
from datetime import date, timedelta
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
              url: str = "/", notif_type: str = "general", exam_key: str = "") -> None:
    """Отправляет одно push-уведомление."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return
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
    except WebPushException as e:
        if e.response and e.response.status_code in (404, 410):
            raise  # вызывающий код удалит протухшую подписку
        logger.warning(f"Push ошибка: {e}")
    except Exception as e:
        logger.warning(f"Push ошибка: {e}")


# ─── Уведомления об изменениях расписания ─────────────────────────────────────

def notify_group_changes(db, group_name: str, faculty_code: str, changes_count: int) -> None:
    """Отправляет уведомление подписчикам группы при изменении расписания."""
    from app.models import UserSubscription, Group

    groups = db.query(Group).filter(Group.name == group_name).all()
    if not groups:
        return

    group_ids = [g.id for g in groups]
    subs = db.query(UserSubscription).filter(
        UserSubscription.group_id.in_(group_ids),
        UserSubscription.push_endpoint.isnot(None),
    ).all()

    label = f"{groups[0].year} курс · {group_name}"
    ending = "изменение" if changes_count == 1 else ("изменения" if changes_count < 5 else "изменений")
    body = f"{changes_count} {ending} в расписании"

    stale_ids = []
    for sub in subs:
        try:
            send_push(sub.push_endpoint, sub.push_keys,
                      f"Расписание изменилось — {label}", body, "/")
        except WebPushException:
            stale_ids.append(sub.id)
        except Exception:
            pass

    if stale_ids:
        for sid in stale_ids:
            sub = db.get(UserSubscription, sid)
            if sub:
                sub.push_endpoint = None
                sub.push_keys = None
        db.commit()


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
            body = f"{exam.subject} — {_day_label(exam)}. Успей подготовиться!"

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
            if ed == tomorrow:
                notif_type = "day_before"
                title = "⏰ Завтра зачёт!"
                time_str = PAIR_START.get(lesson.pair_number, "")
                body = f"{lesson.subject}{f' в {time_str}' if time_str else ''}. Готовься, ты сможешь! 💪"
            elif ed == today:
                notif_type = "day_of"
                title = "🍀 Сегодня зачёт!"
                time_str = PAIR_START.get(lesson.pair_number, "")
                body = f"{lesson.subject}{f' в {time_str}' if time_str else ''}. Удачи тебе!"
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
