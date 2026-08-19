"""Основные эндпоинты расписания."""

from datetime import date, datetime, time, timedelta
from typing import Optional, List
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

# Душанбе — UTC+5, не переходит на летнее время
TZ_DUSHANBE = ZoneInfo("Asia/Dushanbe")

from app.database import get_db
from app.models import (
    Lesson, Group, Teacher, Faculty, WeekSchedule, PAIR_TIMES
)
from app.schemas import LessonSchema, TodayScheduleItem, StatsSchema
from app.services.parser import override_teacher_name

router = APIRouter(prefix="/schedule", tags=["schedule"])

DAYS_ORDER = [
    "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"
]

# ── Кэш «свободных аудиторий» ─────────────────────────────────────────────
# Данные меняются только при синхронизации (раз в 2 часа), поэтому результат
# можно кэшировать. Сбрасывается из sync после обновления расписания.
import time as _time_mod
_FREE_ROOMS_CACHE: dict = {}
_FREE_ROOMS_TTL = 900.0  # 15 минут — страховка, если кэш не сбросили вручную


def clear_free_rooms_cache() -> None:
    _FREE_ROOMS_CACHE.clear()


def enrich_lesson(lesson: Lesson) -> dict:
    """Добавляет время пары к объекту урока и возвращает чистый dict."""
    times = PAIR_TIMES.get(lesson.pair_number, ("", ""))
    teacher = None
    if lesson.teacher:
        # Подменяем код кафедры реальным ФИО прямо при выдаче — чтобы карточка
        # показывала верное имя сразу, не дожидаясь следующей синхронизации.
        name = override_teacher_name(lesson.subject, lesson.teacher.name) or lesson.teacher.name
        teacher = {"id": lesson.teacher.id, "name": name}
    return {
        "id": lesson.id,
        "subject": lesson.subject,
        "lesson_type": lesson.lesson_type,
        "day_of_week": lesson.day_of_week,
        "lesson_date": str(lesson.lesson_date) if lesson.lesson_date else None,
        "pair_number": lesson.pair_number,
        "pair_time_start": times[0],
        "pair_time_end": times[1],
        "teacher": teacher,
        "room": {"id": lesson.room.id, "name": lesson.room.name} if lesson.room else None,
        "group": {
            "id": lesson.group.id,
            "name": lesson.group.name,
            "year": lesson.group.year,
            "faculty_code": lesson.group.faculty.code if lesson.group.faculty else None,
        } if lesson.group else None,
    }


@router.get("/groups", response_model=list)
def get_groups(
    faculty_code: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Список всех групп с возможностью фильтрации."""
    q = db.query(Group).join(Faculty)
    if faculty_code:
        q = q.filter(Faculty.code == faculty_code)
    if year:
        q = q.filter(Group.year == year)
    groups = q.order_by(Group.year, Group.name).all()
    return [
        {
            "id": g.id,
            "name": g.name,
            "year": g.year,
            "faculty_code": g.faculty.code,
            "faculty_name": g.faculty.name,
        }
        for g in groups
    ]


@router.get("/weeks/{group_id}", response_model=list)
def get_available_weeks(group_id: int, db: Session = Depends(get_db)):
    """Список доступных недель для группы — дедуплицированный по week_start."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    weeks = (
        db.query(WeekSchedule)
        .filter_by(faculty_code=group.faculty.code)
        .order_by(WeekSchedule.downloaded_at.desc())
        .all()
    )

    # Дедупликация: оставляем только самую свежую запись для каждой week_start
    seen: set = set()
    unique_weeks = []
    for w in weeks:
        if w.week_start not in seen:
            seen.add(w.week_start)
            unique_weeks.append(w)

    return [
        {
            "id": w.id,
            "week_number": w.week_number,
            "week_start": str(w.week_start),
            "downloaded_at": w.downloaded_at.isoformat() if w.downloaded_at else None,
            "is_latest": w.is_latest,
        }
        for w in unique_weeks
    ]


@router.get("/group/{group_id}", response_model=list)
def get_group_schedule(
    group_id: int,
    day_of_week: Optional[str] = None,
    week_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Расписание конкретной группы. week_id — конкретная неделя (архив), иначе текущая."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    if week_id:
        latest_week = db.get(WeekSchedule, week_id)
        if not latest_week or latest_week.faculty_code != group.faculty.code:
            raise HTTPException(404, "Неделя не найдена")
    else:
        latest_week = (
            db.query(WeekSchedule)
            .filter_by(faculty_code=group.faculty.code, is_latest=True)
            .order_by(WeekSchedule.downloaded_at.desc())
            .first()
        )
    if not latest_week:
        return []

    q = (
        db.query(Lesson)
        .options(joinedload(Lesson.teacher), joinedload(Lesson.room), joinedload(Lesson.group).joinedload(Group.faculty))
        .filter(Lesson.week_schedule_id == latest_week.id)
        .filter(Lesson.group_id == group_id)
    )
    if day_of_week:
        q = q.filter(Lesson.day_of_week == day_of_week.lower())

    lessons = q.all()
    enriched = [enrich_lesson(l) for l in lessons]
    enriched.sort(key=lambda x: (
        DAYS_ORDER.index(x["day_of_week"]) if x["day_of_week"] in DAYS_ORDER else 99,
        ["I", "II", "III", "IV", "V"].index(x["pair_number"])
    ))
    return enriched


@router.get("/teacher/{teacher_id}", response_model=list)
def get_teacher_schedule(
    teacher_id: int,
    day_of_week: Optional[str] = None,
    week_start: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Расписание преподавателя. week_start — конкретная неделя, иначе текущая."""
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(404, "Преподаватель не найден")

    if week_start:
        try:
            ws_date = date.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(400, "Неверный формат даты")
        # По одной самой свежей записи на каждый факультет — избегаем дублей
        week_ids = []
        for fcode in ["ЕНФ", "ГФ"]:
            w = (
                db.query(WeekSchedule)
                .filter(WeekSchedule.faculty_code == fcode, WeekSchedule.week_start == ws_date)
                .order_by(WeekSchedule.downloaded_at.desc())
                .first()
            )
            if w:
                week_ids.append(w.id)
    else:
        # Последние расписания обоих факультетов
        week_ids = []
        for fcode in ["ЕНФ", "ГФ"]:
            w = (
                db.query(WeekSchedule)
                .filter_by(faculty_code=fcode, is_latest=True)
                .order_by(WeekSchedule.downloaded_at.desc())
                .first()
            )
            if w:
                week_ids.append(w.id)

    q = (
        db.query(Lesson)
        .options(
            joinedload(Lesson.teacher),
            joinedload(Lesson.room),
            joinedload(Lesson.group).joinedload(Group.faculty),
        )
        .filter(Lesson.teacher_id == teacher_id)
        .filter(Lesson.week_schedule_id.in_(week_ids))
    )
    if day_of_week:
        q = q.filter(Lesson.day_of_week == day_of_week.lower())

    lessons = q.all()
    enriched = [enrich_lesson(l) for l in lessons]
    enriched.sort(key=lambda x: (
        DAYS_ORDER.index(x["day_of_week"]) if x["day_of_week"] in DAYS_ORDER else 99,
        ["I", "II", "III", "IV", "V"].index(x["pair_number"])
    ))
    return enriched


@router.get("/weeks-all", response_model=list)
def get_all_weeks(db: Session = Depends(get_db)):
    """Все уникальные недели по всем факультетам — для глобального переключателя."""
    weeks = (
        db.query(WeekSchedule)
        .order_by(WeekSchedule.week_start.desc(), WeekSchedule.downloaded_at.desc())
        .all()
    )
    seen: set = set()
    unique: list = []
    for w in weeks:
        if w.week_start not in seen:
            seen.add(w.week_start)
            unique.append(w)
    return [
        {
            "week_start": str(w.week_start),
            "week_number": w.week_number,
            "is_latest": w.is_latest,
        }
        for w in unique
    ]


import re as _re

# Инициал вида «Х.» / «Ю.» / «Дж.» — заглавная (+ возможная строчная) и точка.
# Настоящее ФИО содержит хотя бы один такой инициал, а коды кафедр
# («ИТУ», «английский», «кафедра физики») — нет.
_INITIAL_RE = _re.compile(r'[А-ЯЁ][а-яё]?\.')


def is_real_teacher_name(name: str) -> bool:
    """True, если строка похожа на ФИО преподавателя, а не на код кафедры/предмета."""
    if not name:
        return False
    return bool(_INITIAL_RE.search(name))


def _expand_teacher(teacher_id: int, name: str) -> list[dict]:
    """Одна запись преподавателя = один пункт списка.

    Раньше «Стаценко Ю.Ю., Охонвалиева Ш.С.» разбивалось на две строки, но обе
    получали ОДИН И ТОТ ЖЕ teacher_id — то есть, нажав на любую из фамилий,
    студент видел пары обоих преподавателей и не видел личных пар каждого.
    Пока пара умеет ссылаться только на одного преподавателя (teacher_id),
    честнее показать совмещённую запись как есть: тогда расписание всегда
    соответствует тому, на что нажали. Поиск по фамилии всё равно находит —
    он ищет подстроку."""
    return [{"id": teacher_id, "name": name}]


@router.get("/teachers")
def get_teachers(week_start: Optional[str] = None, db: Session = Depends(get_db)):
    """Список преподавателей. Если week_start задан — только те, у кого есть занятия в эту неделю.

    В список попадают только настоящие ФИО — коды кафедр/предметов
    («ИТУ», «английский» и т.п.) отфильтровываются, а одинаковые имена
    (один и тот же преподаватель в разных совмещённых записях) дедуплицируются.
    """
    if week_start:
        try:
            ws_date = date.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(400, "Неверный формат даты")
        # По одной самой свежей записи на каждый факультет — избегаем дублей
        week_ids = []
        for fcode in ["ЕНФ", "ГФ"]:
            w = (
                db.query(WeekSchedule)
                .filter(WeekSchedule.faculty_code == fcode, WeekSchedule.week_start == ws_date)
                .order_by(WeekSchedule.downloaded_at.desc())
                .first()
            )
            if w:
                week_ids.append(w.id)
        active_ids: set = set()
        if week_ids:
            rows = (
                db.query(Lesson.teacher_id)
                .filter(Lesson.week_schedule_id.in_(week_ids), Lesson.teacher_id.isnot(None))
                .distinct()
                .all()
            )
            active_ids = {r[0] for r in rows}
        teachers = db.query(Teacher).filter(Teacher.id.in_(active_ids)).order_by(Teacher.name).all()
    else:
        teachers = db.query(Teacher).order_by(Teacher.name).all()

    result = []
    seen_names: set = set()
    for t in teachers:
        for entry in _expand_teacher(t.id, t.name):
            # Пропускаем коды кафедр/предметов и дубли по имени
            if not is_real_teacher_name(entry["name"]):
                continue
            if entry["name"] in seen_names:
                continue
            seen_names.add(entry["name"])
            result.append(entry)
    return sorted(result, key=lambda x: x["name"])


@router.get("/now", response_model=list)
def get_current_and_next(
    group_id: int,
    db: Session = Depends(get_db),
):
    """'Что сейчас идёт' и 'следующая пара' для группы."""
    # Используем время Душанбе (UTC+5) — сервер может быть в другом часовом поясе
    now = datetime.now(tz=TZ_DUSHANBE)
    today = now.date()
    day_names = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
    today_name = day_names[today.weekday()]

    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    latest_week = (
        db.query(WeekSchedule)
        .filter_by(faculty_code=group.faculty.code, is_latest=True)
        .order_by(WeekSchedule.downloaded_at.desc())
        .first()
    )
    if not latest_week:
        return []

    # Берём всю неделю: сегодняшние пары нужны для «идёт сейчас», а остальные —
    # чтобы после последней пары показать, когда следующий учебный день.
    week_lessons = (
        db.query(Lesson)
        .options(joinedload(Lesson.teacher), joinedload(Lesson.room))
        .filter(
            Lesson.week_schedule_id == latest_week.id,
            Lesson.group_id == group_id,
        )
        .all()
    )
    lessons = [l for l in week_lessons if l.day_of_week == today_name]

    result = []
    current_time = now.time()
    PAIR_ORDER = ["I", "II", "III", "IV", "V"]

    # Сортируем по порядку пары, чтобы "следующая" была именно ближайшей
    sorted_lessons = sorted(
        lessons,
        key=lambda l: PAIR_ORDER.index(l.pair_number) if l.pair_number in PAIR_ORDER else 99
    )

    # Идёт ли сейчас какая-то пара — нужно, чтобы отличить перемену от «идёт пара»
    def _bounds(l):
        t = PAIR_TIMES.get(l.pair_number)
        if not t:
            return None
        return (time(*map(int, t[0].split(":"))), time(*map(int, t[1].split(":"))))

    any_current = any(
        b and b[0] <= current_time <= b[1]
        for b in (_bounds(l) for l in sorted_lessons)
    )
    # Конец последней уже закончившейся пары — начало перемены
    ended = [b[1] for b in (_bounds(l) for l in sorted_lessons) if b and b[1] < current_time]
    last_end = max(ended) if ended else None

    found_next = False  # берём только одну "следующую" пару
    for lesson in sorted_lessons:
        times = PAIR_TIMES.get(lesson.pair_number)
        if not times:
            continue
        t_start = time(*map(int, times[0].split(":")))
        t_end = time(*map(int, times[1].split(":")))

        is_current = t_start <= current_time <= t_end
        is_next = (not found_next) and (current_time < t_start)

        if is_current:
            result.append(TodayScheduleItem(
                pair_number=lesson.pair_number,
                pair_time_start=times[0],
                pair_time_end=times[1],
                subject=lesson.subject,
                lesson_type=lesson.lesson_type,
                teacher=lesson.teacher.name if lesson.teacher else None,
                room=lesson.room.name if lesson.room else None,
                group_name=group.name,
                is_current=True,
                is_next=False,
                minutes_until=None,
            ))
        elif is_next:
            # Считаем разницу в том же часовом поясе
            target = datetime.combine(today, t_start, tzinfo=TZ_DUSHANBE)
            mins = int((target - now).total_seconds() // 60)

            # Сейчас перемена, если пара не идёт, но сегодня уже была предыдущая.
            # Длина перемены статична (конец прошлой пары → начало этой), поэтому
            # её безопасно кэшировать на клиенте — обратный отсчёт клиент считает сам.
            break_minutes = None
            if not any_current and last_end is not None:
                gap = datetime.combine(today, t_start) - datetime.combine(today, last_end)
                break_minutes = int(gap.total_seconds() // 60)

            result.append(TodayScheduleItem(
                pair_number=lesson.pair_number,
                pair_time_start=times[0],
                pair_time_end=times[1],
                subject=lesson.subject,
                lesson_type=lesson.lesson_type,
                teacher=lesson.teacher.name if lesson.teacher else None,
                room=lesson.room.name if lesson.room else None,
                group_name=group.name,
                is_current=False,
                is_next=True,
                minutes_until=mins,
                break_minutes=break_minutes,
            ))
            found_next = True  # больше "следующих" не добавляем

    # На сегодня пары закончились — показываем ближайшую пару следующего
    # учебного дня, чтобы экран не оставался пустым.
    if not result:
        DAY_IN = {
            "понедельник": "В понедельник", "вторник": "Во вторник", "среда": "В среду",
            "четверг": "В четверг", "пятница": "В пятницу", "суббота": "В субботу",
            "воскресенье": "В воскресенье",
        }
        # Только до конца ТЕКУЩЕЙ недели: расписание хранится понедельно, и пары
        # понедельника в этой записи — это прошедший понедельник, а не будущий.
        # Расписание на следующую неделю появится отдельной записью — тогда
        # она станет актуальной и этот же код покажет её дни.
        days_left = 6 - today.weekday()   # пн=0 … вс=6
        for offset in range(1, days_left + 1):
            d = today + timedelta(days=offset)
            dname = day_names[d.weekday()]
            day_lessons = sorted(
                (l for l in week_lessons if l.day_of_week == dname),
                key=lambda l: PAIR_ORDER.index(l.pair_number) if l.pair_number in PAIR_ORDER else 99,
            )
            if not day_lessons:
                continue
            first = day_lessons[0]
            times = PAIR_TIMES.get(first.pair_number)
            if not times:
                continue
            result.append(TodayScheduleItem(
                pair_number=first.pair_number,
                pair_time_start=times[0],
                pair_time_end=times[1],
                subject=first.subject,
                lesson_type=first.lesson_type,
                teacher=first.teacher.name if first.teacher else None,
                room=first.room.name if first.room else None,
                group_name=group.name,
                is_current=False,
                is_next=False,
                minutes_until=None,
                is_tomorrow=True,
                day_label="Завтра" if offset == 1 else DAY_IN.get(dname, dname.capitalize()),
            ))
            break

    return result


@router.get("/free-rooms")
def get_free_rooms(
    day_of_week: str = Query(..., description="понедельник, вторник, ..."),
    pair_number: str = Query(..., description="I, II, III, IV, V"),
    week_start: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Свободные аудитории в указанный день и пару. week_start — конкретная неделя."""
    from app.models import Room

    # Кэш: ключ = день|пара|неделя. Результат идентичен для всех пользователей.
    cache_key = (day_of_week.lower(), pair_number.upper(), week_start or "latest")
    hit = _FREE_ROOMS_CACHE.get(cache_key)
    if hit and (_time_mod.time() - hit[1]) < _FREE_ROOMS_TTL:
        return hit[0]

    all_rooms = {r.id: r.name for r in db.query(Room).all()}

    # Определяем week_ids — по одной свежей записи на факультет
    latest_week_ids = []
    for fcode in ["ЕНФ", "ГФ"]:
        if week_start:
            try:
                ws_date = date.fromisoformat(week_start)
            except ValueError:
                raise HTTPException(400, "Неверный формат даты")
            w = (
                db.query(WeekSchedule)
                .filter(WeekSchedule.faculty_code == fcode, WeekSchedule.week_start == ws_date)
                .order_by(WeekSchedule.downloaded_at.desc())
                .first()
            )
        else:
            w = (
                db.query(WeekSchedule)
                .filter_by(faculty_code=fcode, is_latest=True)
                .order_by(WeekSchedule.downloaded_at.desc())
                .first()
            )
        if w:
            latest_week_ids.append(w.id)

    occupied = (
        db.query(Lesson)
        .options(
            joinedload(Lesson.room),
            joinedload(Lesson.group).joinedload(Group.faculty),
            joinedload(Lesson.teacher),
        )
        .filter(
            Lesson.week_schedule_id.in_(latest_week_ids),
            Lesson.day_of_week == day_of_week.lower(),
            Lesson.pair_number == pair_number.upper(),
            Lesson.room_id.isnot(None),
        )
        .all()
    )

    def short_group_name(name: str) -> str:
        n = name.strip().upper()
        if "ПРИКЛАДНАЯ МАТЕМАТИКА" in n or ("МАТЕМАТИК" in n and "ИНФОРМАТИК" in n):
            return "ПМиИ"
        if "ХИМИЯ" in n and ("ФИЗИКА" in n or "МЕХАНИКА" in n):
            return "ХФММ"
        if "ГЕОЛОГИЯ" in n:
            return "Геология"
        if "МУНИЦИПАЛЬН" in n or ("ГОСУДАРСТВЕНН" in n and "УПРАВЛЕНИ" in n):
            return "ГМУ"
        if "МЕЖДУНАРОДН" in n and "ОТНОШЕНИ" in n:
            return "МО"
        if "ЛИНГВИСТИК" in n:
            return "Лингвистика"
        return name

    # В одной аудитории может стоять несколько групп (общая лекция — или ошибка
    # в расписании). Раньше словарь перезаписывался и оставалась только последняя,
    # то есть накладка просто пропадала с глаз. Собираем все.
    occupied_map: dict[str, list[str]] = {}
    for l in occupied:
        if l.room:
            type_suffix = f" · {l.lesson_type}" if l.lesson_type else ""
            tname = override_teacher_name(l.subject, l.teacher.name) or l.teacher.name if l.teacher else None
            teacher_name = f" · {tname}" if tname else ""
            group_name = short_group_name(l.group.name) if l.group else ""
            occupied_map.setdefault(l.room.name, []).append(
                f"{l.group.year} курс · {group_name}: {l.subject}{type_suffix}{teacher_name}"
            )

    result = []
    for room_name in sorted(all_rooms.values()):
        if room_name in occupied_map:
            entries = occupied_map[room_name]
            result.append({
                "room_name": room_name,
                "is_free": False,
                # Строкой — чтобы старые версии приложения не сломались
                "occupied_by": "; ".join(entries),
                # Списком — для новых клиентов и подсветки накладок
                "occupied_list": entries,
                "conflict": len(entries) > 1,
            })
        else:
            result.append({"room_name": room_name, "is_free": True})

    _FREE_ROOMS_CACHE[cache_key] = (result, _time_mod.time())
    return result


@router.get("/bulk-sync")
def bulk_sync(db: Session = Depends(get_db)):
    """Всё для офлайн-кэша мобилки одним ответом.

    Раньше мобильный SyncContext делал то же самое за 300+ отдельных HTTP-
    запросов (расписание каждой группы, каждого преподавателя, свободные
    аудитории по каждому дню/паре/неделе) — на слабой сети это занимало
    1-2 минуты. Здесь та же выборка, но обычными вызовами внутри процесса:
    без сетевых round-trip'ов это доли секунды даже на 300+ запросах к SQLite.
    """
    groups = get_groups(db=db)
    weeks_all = get_all_weeks(db)

    group_weeks: dict[int, list] = {}
    schedules: dict[str, list] = {}
    for g in groups:
        gw = get_available_weeks(g["id"], db)
        group_weeks[g["id"]] = gw
        for w in gw:
            schedules[f'{g["id"]}_{w["id"]}'] = get_group_schedule(g["id"], week_id=w["id"], db=db)

    # Текущая неделя + 2 предыдущие — та же логика выбора, что раньше
    # считал клиент (см. syncService.ts мобилки).
    def _is_current(week_start: str) -> bool:
        d = date.fromisoformat(week_start)
        today = date.today()
        return d <= today <= d + timedelta(days=6)

    cur_idx = next((i for i, w in enumerate(weeks_all) if _is_current(w["week_start"])), -1)
    base_idx = max(0, len(weeks_all) - 2) if cur_idx == -1 else cur_idx
    sync_weeks = weeks_all[base_idx: base_idx + 3]

    teachers_by_week: dict[str, list] = {}
    teacher_ids: set = set()
    for w in sync_weeks:
        ts = get_teachers(week_start=w["week_start"], db=db)
        teachers_by_week[w["week_start"]] = ts
        teacher_ids.update(t["id"] for t in ts)

    teacher_schedules: dict[str, list] = {}
    for tid in teacher_ids:
        for w in sync_weeks:
            teacher_schedules[f'{tid}_{w["week_start"]}'] = get_teacher_schedule(
                tid, week_start=w["week_start"], db=db
            )

    free_rooms: dict[str, list] = {}
    pairs = ["I", "II", "III", "IV", "V"]
    for w in sync_weeks:
        for day in DAYS_ORDER:
            for pair in pairs:
                free_rooms[f'{day}_{pair}_{w["week_start"]}'] = get_free_rooms(
                    day, pair, week_start=w["week_start"], db=db
                )

    return {
        "groups": groups,
        "weeks_all": weeks_all,
        "group_weeks": group_weeks,
        "schedules": schedules,
        "teachers_by_week": teachers_by_week,
        "teacher_schedules": teacher_schedules,
        "free_rooms": free_rooms,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/stats/{group_id}", response_model=StatsSchema)
def get_group_stats(group_id: int, db: Session = Depends(get_db)):
    """Статистика по группе: количество пар, загруженность по дням."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    latest_week = (
        db.query(WeekSchedule)
        .filter_by(faculty_code=group.faculty.code, is_latest=True)
        .order_by(WeekSchedule.downloaded_at.desc())
        .first()
    )
    if not latest_week:
        return StatsSchema(
            faculty_code=group.faculty.code, group_name=group.name,
            year=group.year, total_lessons_week=0, lessons_by_day={},
            most_loaded_day=None, unique_teachers=0, unique_subjects=0,
        )

    base_filter = (
        Lesson.week_schedule_id == latest_week.id,
        Lesson.group_id == group_id,
    )

    # Считаем уникальных преподавателей и предметов одним SQL-запросом
    agg = db.query(
        func.count(Lesson.id).label("total"),
        func.count(func.distinct(Lesson.teacher_id)).label("unique_teachers"),
        func.count(func.distinct(Lesson.subject)).label("unique_subjects"),
    ).filter(*base_filter).one()

    # Количество пар по дням — GROUP BY вместо Python-цикла
    by_day_rows = (
        db.query(Lesson.day_of_week, func.count(Lesson.id))
        .filter(*base_filter)
        .group_by(Lesson.day_of_week)
        .all()
    )
    by_day = {row[0]: row[1] for row in by_day_rows}
    most_loaded = max(by_day, key=by_day.get) if by_day else None

    return StatsSchema(
        faculty_code=group.faculty.code,
        group_name=group.name,
        year=group.year,
        total_lessons_week=agg.total,
        lessons_by_day=by_day,
        most_loaded_day=most_loaded,
        unique_teachers=agg.unique_teachers,
        unique_subjects=agg.unique_subjects,
    )


@router.get("/changes")
def get_changes(
    faculty_code: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),   # верхняя граница: эндпоинт публичный
    db: Session = Depends(get_db),
):
    """История изменений расписания."""
    from app.models import ScheduleChange
    q = db.query(ScheduleChange)
    if faculty_code:
        q = q.filter_by(faculty_code=faculty_code)
    changes = q.order_by(ScheduleChange.detected_at.desc()).limit(limit).all()
    return [
        {
            "id": c.id,
            # detected_at хранится в UTC — помечаем «Z», чтобы клиенты показывали
            # время в своём часовом поясе (Душанбе +5), а не сырое UTC
            "detected_at": (c.detected_at.isoformat() + "Z") if c.detected_at else None,
            "faculty_code": c.faculty_code,
            "change_type": c.change_type,
            "group_name": c.group_name,
            "day_of_week": c.day_of_week,
            "pair_number": c.pair_number,
            "old_value": c.old_value,
            "new_value": c.new_value,
            "week_start": str(c.week_start) if c.week_start else None,
        }
        for c in changes
    ]
