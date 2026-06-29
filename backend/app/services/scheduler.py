"""Планировщик задач: синхронизация расписания + ежедневные напоминания об экзаменах."""

import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.core.config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Asia/Dushanbe")


async def _run_sync():
    from app.services.sync import sync_all
    logger.info("Планировщик: запуск синхронизации расписания...")
    results = await sync_all()
    for r in results:
        logger.info(f"  {r}")


async def _run_exam_reminders():
    from app.services.push import send_exam_daily_reminders
    from app.database import SessionLocal
    logger.info("Планировщик: отправка напоминаний об экзаменах...")
    db = SessionLocal()
    try:
        send_exam_daily_reminders(db)
    except Exception as e:
        logger.error(f"Ошибка при отправке напоминаний: {e}", exc_info=True)
    finally:
        db.close()


def start_scheduler():
    # Синхронизация расписания каждые N часов
    scheduler.add_job(
        _run_sync,
        trigger=IntervalTrigger(hours=settings.CHECK_INTERVAL_HOURS),
        id="sync_schedule",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # Ежедневные напоминания о зачётах в 07:00 по Душанбе
    scheduler.add_job(
        _run_exam_reminders,
        trigger=CronTrigger(hour=7, minute=0, timezone="Asia/Dushanbe"),
        id="exam_reminders",
        replace_existing=True,
        misfire_grace_time=600,
    )

    scheduler.start()
    logger.info(
        f"Планировщик запущен: синхронизация каждые {settings.CHECK_INTERVAL_HOURS} ч., "
        "напоминания об экзаменах ежедневно в 07:00."
    )


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Планировщик остановлен.")
