"""Эндпоинты администрирования: ручной запуск синхронизации, логи."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SyncLog, WeekSchedule

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/sync")
async def manual_sync(force: bool = False):
    """Ручной запуск синхронизации расписания с сайта msu.tj."""
    from app.services.sync import sync_all
    results = await sync_all(force=force)
    return {"results": results}


@router.post("/sync/{faculty_code}")
async def sync_one(faculty_code: str, force: bool = False):
    """Синхронизация конкретного факультета."""
    from app.services.sync import sync_faculty
    if faculty_code not in ("ЕНФ", "ГФ"):
        from fastapi import HTTPException
        raise HTTPException(400, "Факультет должен быть ЕНФ или ГФ")
    result = await sync_faculty(faculty_code, force=force)
    return result


@router.get("/sync-logs")
def get_sync_logs(limit: int = 20, db: Session = Depends(get_db)):
    """Последние записи журнала синхронизации."""
    logs = db.query(SyncLog).order_by(SyncLog.started_at.desc()).limit(limit).all()
    return logs


@router.get("/weeks")
def get_weeks(db: Session = Depends(get_db)):
    """Все загруженные недели расписания."""
    weeks = db.query(WeekSchedule).order_by(WeekSchedule.week_start.desc()).all()
    return weeks
