"""Эндпоинты администрирования: ручной запуск синхронизации, логи.

Все POST-маршруты защищены заголовком X-Admin-Secret.
Значение задаётся переменной окружения ADMIN_SECRET в .env.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.models import SyncLog, WeekSchedule

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(x_admin_secret: str = Header(default="")) -> None:
    """Проверяет секретный ключ администратора."""
    if not settings.ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="ADMIN_SECRET не задан на сервере")
    if x_admin_secret != settings.ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Неверный ключ администратора")


@router.post("/sync")
async def manual_sync(force: bool = False, _: None = Depends(require_admin)):
    """Ручной запуск синхронизации расписания с сайта msu.tj."""
    from app.services.sync import sync_all
    results = await sync_all(force=force)
    return {"results": results}


@router.post("/sync/{faculty_code}")
async def sync_one(faculty_code: str, force: bool = False, _: None = Depends(require_admin)):
    """Синхронизация конкретного факультета."""
    from app.services.sync import sync_faculty
    if faculty_code not in ("ЕНФ", "ГФ"):
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
