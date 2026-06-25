"""Планировщик автосинхронизации — запускает sync_all каждые 2 часа."""

import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from app.core.config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Asia/Dushanbe")


async def _run_sync():
    from app.services.sync import sync_all
    logger.info("Планировщик: запуск синхронизации расписания...")
    results = await sync_all()
    for r in results:
        logger.info(f"  {r}")


def start_scheduler():
    scheduler.add_job(
        _run_sync,
        trigger=IntervalTrigger(hours=settings.CHECK_INTERVAL_HOURS),
        id="sync_schedule",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.start()
    logger.info(f"Планировщик запущен: синхронизация каждые {settings.CHECK_INTERVAL_HOURS} ч.")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Планировщик остановлен.")
