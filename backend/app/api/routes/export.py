"""Экспорт расписания в .ics (Google Calendar / iCal)."""

from datetime import datetime, date, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from icalendar import Calendar, Event
import uuid

from app.database import get_db
from app.models import Lesson, Group, WeekSchedule, PAIR_TIMES

router = APIRouter(prefix="/export", tags=["export"])


def time_str_to_time(t: str) -> time:
    h, m = map(int, t.split(":"))
    return time(h, m)


@router.get("/ics/{group_id}")
def export_group_ics(
    group_id: int,
    db: Session = Depends(get_db),
):
    """Экспорт расписания группы в формат .ics для Google Calendar."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Группа не найдена")

    latest_week = (
        db.query(WeekSchedule)
        .filter_by(faculty_code=group.faculty.code)
        .order_by(WeekSchedule.week_start.desc())
        .first()
    )
    if not latest_week:
        raise HTTPException(404, "Расписание не найдено")

    lessons = (
        db.query(Lesson)
        .options(joinedload(Lesson.teacher), joinedload(Lesson.room))
        .filter(
            Lesson.week_schedule_id == latest_week.id,
            Lesson.group_id == group_id,
        )
        .all()
    )

    cal = Calendar()
    cal.add("prodid", "-//МГУ Душанбе Schedule//msu.tj//RU")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", f"Расписание {group.name} {group.year} курс")
    cal.add("x-wr-timezone", "Asia/Dushanbe")

    for lesson in lessons:
        if not lesson.lesson_date:
            continue

        times = PAIR_TIMES.get(lesson.pair_number)
        if not times:
            continue

        t_start = time_str_to_time(times[0])
        t_end = time_str_to_time(times[1])

        dt_start = datetime.combine(lesson.lesson_date, t_start)
        dt_end = datetime.combine(lesson.lesson_date, t_end)

        event = Event()
        event.add("summary", lesson.subject)

        description_parts = []
        if lesson.teacher:
            description_parts.append(f"Преподаватель: {lesson.teacher.name}")
        if lesson.lesson_type:
            description_parts.append(f"Тип: {lesson.lesson_type}")
        description_parts.append(f"Пара: {lesson.pair_number}")
        event.add("description", "\n".join(description_parts))

        if lesson.room:
            event.add("location", f"Аудитория {lesson.room.name}")

        event.add("dtstart", dt_start)
        event.add("dtend", dt_end)
        event.add("uid", str(uuid.uuid4()))
        event.add("dtstamp", datetime.utcnow())

        cal.add_component(event)

    ics_content = cal.to_ical()
    # ASCII-имя для совместимости (RFC 5987)
    safe_name = f"schedule_group{group.id}_{group.year}kurs.ics"

    return Response(
        content=ics_content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )
