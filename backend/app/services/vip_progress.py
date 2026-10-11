"""Серия посещений и достижения «золотого профиля» (решение владельца, 11 окт 2026).

Сайт особого человека (frontend/src/lib/special.ts) раз в день и при новом событии
присылает отметку. Сервер хранит одну строку VipProgress на человека:
- days — даты (по Душанбе), когда открывал сайт;
- offdays — будни, когда у его группы не было пар: серию они не рвут. Узнаём из
  расписания в базе при каждой отметке (архив недель живёт 7 дней — хватает, если
  заходить хотя бы раз в неделю);
- events — когда случилось особое: early (до 7:30), owl (после 23:00), explorer (все
  вкладки), collector (все три металла), secret (пасхалка), names (ответ в опросе имён).
Серию, рекорд и даты получения медалей считает сайт из этих списков.

С 11 окт 2026 здесь же профиль владельца (person = "owner", пускает только привязанные
в /dev устройства — api/routes/user.py). Его «теоремы»: pi (15:14), palindrome (12:21
или 21:12), zero (секрет: 0:00) — время проверяет сервер по своим часам.

Ответ держим в памяти: повторные открытия Кабинета базу не будят.
"""

import json
import threading
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import Group, Lesson, TeacherNameVote, UserRegistration, VipProgress, WeekSchedule

TZ = ZoneInfo("Asia/Dushanbe")
DAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]

# Кто особый: ключ — как на сайте (special.ts), значение — первое слово имени в регистрации.
PEOPLE = {"shahzoda": "шахзода"}
# События, которые сайт может попросить отметить. Время у early/owl/pi/palindrome/zero
# сервер проверяет по своим часам.
CLIENT_EVENTS = {"early", "owl", "explorer", "collector", "secret", "pi", "palindrome", "zero"}


def _time_ok(flag: str, now: datetime) -> bool:
    hm = now.strftime("%H:%M")
    minutes = now.hour * 60 + now.minute
    if flag == "early":
        return 4 * 60 <= minutes < 7 * 60 + 30
    if flag == "owl":
        return now.hour >= 23
    if flag == "pi":
        return hm == "15:14"
    if flag == "palindrome":
        return hm in ("12:21", "21:12")
    if flag == "zero":
        return minutes <= 1          # 0:00–0:01: запрос может прийти на минуту позже
    return True

_cache: dict[str, dict] = {}
_lock = threading.Lock()


def first_word(name: str | None) -> str:
    w = (name or "").strip().split()
    return "".join(ch for ch in (w[0] if w else "").lower().replace("ё", "е") if ch.isalpha())


def _state(row: VipProgress) -> dict:
    return {
        "first_day": row.first_day.isoformat() if row.first_day else None,
        "days": json.loads(row.days or "[]"),
        "offdays": json.loads(row.offdays or "[]"),
        "events": json.loads(row.events or "{}"),
    }


def _group_offdays(db: Session, group_id: int | None, start: date, end: date) -> set[str]:
    """Будни в [start, end], когда у группы не было ни одной пары, — только для недель,
    которые есть в базе (иначе не знаем и ничего не утверждаем)."""
    if not group_id:
        return set()
    group = db.get(Group, group_id)
    if not group or not group.faculty:
        return set()
    weeks = db.query(WeekSchedule).filter(
        WeekSchedule.faculty_code == group.faculty.code,
        WeekSchedule.is_latest.is_(True),
        WeekSchedule.week_start >= start - timedelta(days=6),
        WeekSchedule.week_start <= end,
    ).all()
    out: set[str] = set()
    for w in weeks:
        busy = {
            d for (d,) in db.query(Lesson.day_of_week)
            .filter(Lesson.week_schedule_id == w.id, Lesson.group_id == group_id).distinct()
        }
        for i, name in enumerate(DAYS[:6]):
            d = w.week_start + timedelta(days=i)
            if start <= d <= end and name not in busy:
                out.add(d.isoformat())
    return out


def touch(db: Session, person: str, reg: UserRegistration, visit: bool, flags: list[str]) -> dict:
    """Отметить посещение и события. Пишет в базу, только если что-то изменилось."""
    now = datetime.now(tz=TZ)
    today = now.date()
    with _lock:
        cached = _cache.get(person)
        wants_new = visit and (not cached or today.isoformat() not in cached["days"])
        wants_event = any(f in CLIENT_EVENTS and (not cached or f not in cached["events"]) for f in flags)
        if cached and not wants_new and not wants_event:
            return cached

        row = db.query(VipProgress).filter_by(person=person).first()
        if row is None:
            row = VipProgress(person=person, days="[]", offdays="[]", events="{}")
            db.add(row)
        st = _state(row)
        changed = row.id is None

        if visit and today.isoformat() not in st["days"]:
            st["days"].append(today.isoformat())
            st["days"].sort()
            changed = True
            # Дни без пар за последнюю неделю — серия их не считает пропуском
            off = set(st["offdays"]) | _group_offdays(db, reg.group_id, today - timedelta(days=7), today)
            if off != set(st["offdays"]):
                st["offdays"] = sorted(off)
        if row.first_day is None:
            reg_day = reg.registered_at.replace(tzinfo=ZoneInfo("UTC")).astimezone(TZ).date() if reg.registered_at else today
            row.first_day = min(reg_day, today)
            changed = True

        stamp = now.strftime("%Y-%m-%dT%H:%M")
        for f in flags:
            if f not in CLIENT_EVENTS or f in st["events"] or not _time_ok(f, now):
                continue
            st["events"][f] = stamp
            changed = True
        if person in PEOPLE and "names" not in st["events"]:
            devices = [r.device_id for r in db.query(UserRegistration.device_id, UserRegistration.name).all()
                       if first_word(r.name) == PEOPLE[person]]
            voted = db.query(TeacherNameVote).filter(
                TeacherNameVote.device_id.in_(devices), TeacherNameVote.variant_id.isnot(None)).first() if devices else None
            if voted:
                st["events"]["names"] = stamp
                changed = True

        if changed:
            row.days = json.dumps(st["days"])
            row.offdays = json.dumps(st["offdays"])
            row.events = json.dumps(st["events"], ensure_ascii=False)
            db.commit()
        result = _state(row)
        _cache[person] = result
        return result
