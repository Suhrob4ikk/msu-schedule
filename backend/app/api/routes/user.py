"""Личный кабинет: заметки, посещаемость, подписки."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LessonNote, AttendanceRecord, Lesson, Group, UserSubscription, UserRegistration
from app.schemas import (
    LessonNoteCreate, LessonNoteSchema,
    AttendanceCreate, AttendanceSchema,
)

router = APIRouter(prefix="/user", tags=["user"])


@router.post("/register")
def register_user(
    device_id: str,
    name: str,
    group_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Сохраняет или обновляет регистрацию пользователя (имя + группа)."""
    from app.services.email import send_registration_email

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
    db.commit()

    # Письмо отправляем только при первой регистрации (не при каждом обновлении)
    if is_new:
        background_tasks.add_task(send_registration_email, name.strip() or "Аноним", group_label)

    return {"ok": True}


@router.get("/notes/{session_id}")
def get_notes(session_id: str, db: Session = Depends(get_db)):
    """Заметки пользователя к парам."""
    notes = db.query(LessonNote).filter_by(session_id=session_id).all()
    return notes


@router.post("/notes", response_model=LessonNoteSchema)
def create_note(
    session_id: str,
    note_data: LessonNoteCreate,
    db: Session = Depends(get_db),
):
    note = LessonNote(session_id=session_id, **note_data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, session_id: str, db: Session = Depends(get_db)):
    note = db.query(LessonNote).filter_by(id=note_id, session_id=session_id).first()
    if not note:
        raise HTTPException(404, "Заметка не найдена")
    db.delete(note)
    db.commit()
    return {"ok": True}


@router.post("/attendance")
def mark_attendance(
    session_id: str,
    data: AttendanceCreate,
    db: Session = Depends(get_db),
):
    """Отметить посещение / пропуск пары."""
    existing = db.query(AttendanceRecord).filter_by(
        session_id=session_id, lesson_id=data.lesson_id
    ).first()

    if existing:
        existing.attended = data.attended
        db.commit()
        return existing

    record = AttendanceRecord(
        session_id=session_id,
        lesson_id=data.lesson_id,
        attended=data.attended,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/attendance/{session_id}")
def get_attendance(session_id: str, db: Session = Depends(get_db)):
    """Статистика посещаемости студента."""
    records = db.query(AttendanceRecord).filter_by(session_id=session_id).all()
    total = len(records)
    attended = sum(1 for r in records if r.attended)
    return {
        "total": total,
        "attended": attended,
        "skipped": total - attended,
        "rate": round(attended / total * 100, 1) if total else 0,
        "records": [{"lesson_id": r.lesson_id, "attended": r.attended} for r in records],
    }


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
