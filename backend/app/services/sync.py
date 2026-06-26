"""
Сервис синхронизации: скачивает расписание, обновляет БД, фиксирует изменения.
Хранит историю за 2 недели — старые версии не удаляются сразу, становятся архивом.
"""

import logging
from datetime import datetime, date, timedelta
from typing import Optional
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Faculty, Group, Teacher, Room, WeekSchedule,
    Lesson, ScheduleChange, SyncLog
)
from app.services.parser import (
    download_xls, parse_xls_file, get_remote_last_modified, FACULTY_FILES
)

logger = logging.getLogger(__name__)


def get_or_create_faculty(db: Session, code: str) -> Faculty:
    faculty = db.query(Faculty).filter_by(code=code).first()
    if not faculty:
        names = {"ЕНФ": "Естественнонаучный факультет", "ГФ": "Гуманитарный факультет"}
        faculty = Faculty(
            code=code,
            name=names.get(code, code),
            xls_file=FACULTY_FILES.get(code, ""),
        )
        db.add(faculty)
        db.flush()
    return faculty


def get_or_create_group(db: Session, faculty_id: int, name: str, year: int,
                         sheet_idx: int, block_idx: int) -> Group:
    group = db.query(Group).filter_by(
        faculty_id=faculty_id, name=name, year=year
    ).first()
    if not group:
        group = Group(
            faculty_id=faculty_id,
            name=name,
            year=year,
            sheet_index=sheet_idx,
            block_index=block_idx,
        )
        db.add(group)
        db.flush()
    return group


def get_or_create_teacher(db: Session, name: str) -> Teacher:
    teacher = db.query(Teacher).filter_by(name=name).first()
    if not teacher:
        teacher = Teacher(name=name)
        db.add(teacher)
        db.flush()
    return teacher


def get_or_create_room(db: Session, name: str) -> Room:
    room = db.query(Room).filter_by(name=name).first()
    if not room:
        room = Room(name=name)
        db.add(room)
        db.flush()
    return room


def detect_changes(db: Session, week_schedule: WeekSchedule, new_lessons: list[dict],
                   group: Group) -> list[dict]:
    """Сравнивает новое расписание с предыдущей неделей и фиксирует изменения."""
    changes = []

    # Загружаем предыдущее расписание этой группы
    prev_schedule = (
        db.query(WeekSchedule)
        .filter(
            WeekSchedule.faculty_code == week_schedule.faculty_code,
            WeekSchedule.id != week_schedule.id,
        )
        .order_by(WeekSchedule.week_start.desc())
        .first()
    )
    if not prev_schedule:
        return []

    prev_lessons = {
        (l.day_of_week, l.pair_number): l
        for l in db.query(Lesson).filter_by(
            week_schedule_id=prev_schedule.id, group_id=group.id
        ).all()
    }

    new_lesson_keys = {(l["day_of_week"], l["pair_number"]) for l in new_lessons}

    # Удалённые пары
    for key, old in prev_lessons.items():
        if key not in new_lesson_keys:
            changes.append({
                "change_type": "removed",
                "day_of_week": key[0],
                "pair_number": key[1],
                "old_value": old.subject,
                "new_value": None,
            })

    # Добавленные и изменённые пары
    for lesson in new_lessons:
        key = (lesson["day_of_week"], lesson["pair_number"])
        if key not in prev_lessons:
            changes.append({
                "change_type": "added",
                "day_of_week": lesson["day_of_week"],
                "pair_number": lesson["pair_number"],
                "old_value": None,
                "new_value": lesson["subject"],
            })
        else:
            old = prev_lessons[key]
            if old.subject != lesson["subject"]:
                changes.append({
                    "change_type": "changed",
                    "day_of_week": lesson["day_of_week"],
                    "pair_number": lesson["pair_number"],
                    "old_value": old.subject,
                    "new_value": lesson["subject"],
                })

    return changes


def cleanup_old_schedules(db: Session, faculty_code: str):
    """Удаляет архивные версии расписания старше 14 дней."""
    cutoff = date.today() - timedelta(days=14)
    old = (
        db.query(WeekSchedule)
        .filter(
            WeekSchedule.faculty_code == faculty_code,
            WeekSchedule.is_latest == False,
            WeekSchedule.week_start < cutoff,
        )
        .all()
    )
    for ws in old:
        db.delete(ws)
    if old:
        logger.info(f"[{faculty_code}] Удалено {len(old)} архивных версий старше 14 дней")
    db.flush()


def save_schedule_to_db(db: Session, parsed: dict, file_last_modified: Optional[str]) -> tuple[int, int, dict]:
    """
    Сохраняет расписание в БД как новую версию.
    Старая версия той же недели архивируется (is_latest=False), не удаляется.
    Возвращает (количество_уроков, количество_изменений, изменения_по_группам).
    """
    faculty_code = parsed["faculty_code"]
    week_start = parsed["week_start"]
    week_number = parsed["week_number"]

    faculty = get_or_create_faculty(db, faculty_code)

    # Снимаем флаг is_latest у всех предыдущих версий этого факультета
    db.query(WeekSchedule).filter_by(
        faculty_code=faculty_code, is_latest=True
    ).update({"is_latest": False})
    db.flush()

    # Всегда создаём новую запись (архив старой остаётся)
    week_schedule = WeekSchedule(
        week_number=week_number,
        week_start=week_start,
        faculty_code=faculty_code,
        file_last_modified=file_last_modified,
        is_latest=True,
    )
    db.add(week_schedule)
    db.flush()

    # Чистим архив старше 14 дней
    cleanup_old_schedules(db, faculty_code)

    total_lessons = 0
    total_changes = 0
    changes_by_group: dict[str, int] = {}

    for group_data in parsed["groups"]:
        group = get_or_create_group(
            db, faculty.id,
            group_data["name"], group_data["year"],
            group_data["sheet_index"], group_data["block_index"]
        )

        # Определяем изменения относительно предыдущей недели
        changes = detect_changes(db, week_schedule, group_data["lessons"], group)
        for change in changes:
            db.add(ScheduleChange(
                faculty_code=faculty_code,
                group_name=group.name,
                **change,
            ))
        if changes:
            changes_by_group[group.name] = len(changes)
        total_changes += len(changes)

        for lesson_data in group_data["lessons"]:
            teacher = None
            if lesson_data.get("teacher"):
                teacher = get_or_create_teacher(db, lesson_data["teacher"])

            room = None
            if lesson_data.get("room"):
                room = get_or_create_room(db, lesson_data["room"])

            lesson = Lesson(
                week_schedule_id=week_schedule.id,
                group_id=group.id,
                teacher_id=teacher.id if teacher else None,
                room_id=room.id if room else None,
                subject=lesson_data["subject"],
                lesson_type=lesson_data.get("lesson_type"),
                day_of_week=lesson_data["day_of_week"],
                lesson_date=lesson_data.get("lesson_date"),
                pair_number=lesson_data["pair_number"],
            )
            db.add(lesson)
            total_lessons += 1

    db.commit()
    return total_lessons, total_changes, changes_by_group


async def sync_faculty(faculty_code: str, force: bool = False) -> dict:
    """
    Полный цикл синхронизации для одного факультета:
    1. HEAD-запрос для проверки изменений
    2. Скачивание (если изменился)
    3. Парсинг
    4. Сохранение в БД
    """
    db = SessionLocal()
    sync_log = SyncLog(faculty_code=faculty_code, status="running")
    db.add(sync_log)
    db.commit()

    try:
        # Проверяем Last-Modified без скачивания
        remote_lm = await get_remote_last_modified(faculty_code)

        if not force and remote_lm:
            last_sync = (
                db.query(WeekSchedule)
                .filter_by(faculty_code=faculty_code)
                .order_by(WeekSchedule.downloaded_at.desc())
                .first()
            )
            if last_sync and last_sync.file_last_modified == remote_lm:
                logger.info(f"[{faculty_code}] Файл не изменился ({remote_lm}), пропускаем")
                sync_log.status = "no_change"
                sync_log.message = f"Файл не изменился: {remote_lm}"
                sync_log.finished_at = datetime.utcnow()
                db.commit()
                return {"status": "no_change", "faculty": faculty_code}

        # Скачиваем свежий файл
        file_path, last_modified = await download_xls(faculty_code)

        # Парсим
        parsed = parse_xls_file(file_path, faculty_code)

        if not parsed["week_start"]:
            raise ValueError("Не удалось определить дату начала недели из XLS")

        # Сохраняем в БД
        total_lessons, total_changes, changes_by_group = save_schedule_to_db(db, parsed, last_modified)

        # Отправляем push-уведомления подписчикам изменившихся групп
        if total_changes > 0:
            from app.services.push import notify_group_changes
            for group_name, count in changes_by_group.items():
                notify_group_changes(db, group_name, faculty_code, count)

        sync_log.status = "success"
        sync_log.finished_at = datetime.utcnow()
        sync_log.changes_count = total_changes
        sync_log.message = (
            f"Неделя {parsed['week_number']} ({parsed['week_start']}): "
            f"{total_lessons} занятий, {total_changes} изменений"
        )
        db.commit()

        logger.info(f"[{faculty_code}] Синхронизация успешна: {sync_log.message}")
        return {
            "status": "success",
            "faculty": faculty_code,
            "week": parsed["week_number"],
            "lessons": total_lessons,
            "changes": total_changes,
        }

    except Exception as e:
        logger.error(f"[{faculty_code}] Ошибка синхронизации: {e}", exc_info=True)
        sync_log.status = "error"
        sync_log.message = str(e)
        sync_log.finished_at = datetime.utcnow()
        db.commit()
        return {"status": "error", "faculty": faculty_code, "error": str(e)}
    finally:
        db.close()


async def sync_all(force: bool = False) -> list[dict]:
    """Синхронизирует оба факультета параллельно."""
    import asyncio
    results = await asyncio.gather(
        sync_faculty("ЕНФ", force=force),
        sync_faculty("ГФ", force=force),
    )
    return list(results)
