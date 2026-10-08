"""Планировщик задач: синхронизация расписания + ежедневные напоминания об экзаменах."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

TZ = "Asia/Dushanbe"
scheduler = AsyncIOScheduler(timezone=TZ)

# Самая частая проверка — раз в 5 минут, поэтому задача тикает раз в 5 минут,
# а sync_interval_minutes() решает, пора ли проверять именно сейчас.
TICK_MINUTES = 5
REGULAR_INTERVAL = 120


def sync_interval_minutes(now: datetime) -> int:
    """Как часто проверять msu.tj в этот час (время Душанбе).

    msu.tj не присылает событий, поэтому узнать о новом файле можно только
    спросив. Спросить дёшево: HEAD-запрос отдаёт дату изменения файла, сам
    файл качается, только если дата поменялась (см. sync_faculty).

    По живым данным (сен–окт 2026): расписание на новую неделю выходит в
    субботу между 11:00 и 13:00, правки к нему — до ~15:00; правки внутри
    недели — в будни днём.
    """
    wd, h = now.weekday(), now.hour  # 0 = пн … 6 = вс
    if wd == 5 and 10 <= h < 16:        # суббота 10:00–16:00 — выходит новая неделя
        return 5
    if (wd in (4, 5) and h >= 16) or (wd == 6 and h >= 8):
        return 15                       # пт и сб вечер, воскресенье — страховка
    if wd <= 4 and 7 <= h < 21:         # будни днём — правки внутри недели
        return 30
    return REGULAR_INTERVAL             # ночь и прочее — раз в 2 часа


def is_sync_due(now: datetime) -> bool:
    interval = sync_interval_minutes(now)
    return (now.hour * 60 + now.minute) % interval < TICK_MINUTES


async def _run_sync():
    from app.services.sync import sync_all
    now = datetime.now(ZoneInfo(TZ))
    if not is_sync_due(now):
        return
    interval = sync_interval_minutes(now)
    logger.info(f"Планировщик: проверка расписания (режим — раз в {interval} мин)...")
    # Частая проверка не качает файл, если msu.tj не ответил на HEAD
    results = await sync_all(require_head=interval < REGULAR_INTERVAL)
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


async def _run_app_update_check():
    """Вышел новый релиз приложения на GitHub — push «Вышла новая версия»
    тем, у кого стоит старее. Только свежий релиз (APP_UPDATE_FRESH_DAYS)."""
    from datetime import timezone, timedelta
    from app.api.routes.app_update import get_releases_cached
    from app.services.push import notify_app_update, APP_UPDATE_FRESH_DAYS
    from app.database import SessionLocal

    try:
        releases = await get_releases_cached()
    except Exception:
        return  # GitHub недоступен — попробуем через 10 минут
    latest = releases[0]
    if not latest.get("download_url") or not latest.get("published_at"):
        return
    published = datetime.fromisoformat(latest["published_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) - published > timedelta(days=APP_UPDATE_FRESH_DAYS):
        return

    db = SessionLocal()
    try:
        result = notify_app_update(db, latest["version"], latest["download_url"])
        if result["sent"] or result["errors"]:
            logger.info(f"Push «Вышла новая версия {latest['version']}»: {result}")
    except Exception as e:
        logger.error(f"Не удалось разослать «новую версию»: {e}", exc_info=True)
    finally:
        db.close()


async def _run_full_names_digest():
    """13:00 — письмо владельцу о новых вариантах полных имён на проверке."""
    import asyncio
    from app.database import SessionLocal
    from app.services.full_names import send_digest

    def run():
        with SessionLocal() as db:
            return send_digest(db)
    try:
        n = await asyncio.to_thread(run)
        if n:
            logger.info(f"Письмо о вариантах имён: {n}")
    except Exception as e:
        logger.error(f"Письмо о вариантах имён не ушло: {e}", exc_info=True)


def start_scheduler():
    # Проверка расписания: тик раз в 5 минут, частота — по таблице выше
    scheduler.add_job(
        _run_sync,
        trigger=CronTrigger(minute=f"*/{TICK_MINUTES}", timezone=TZ),
        id="sync_schedule",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )

    # Ежедневные напоминания о зачётах в 07:00 по Душанбе
    scheduler.add_job(
        _run_exam_reminders,
        trigger=CronTrigger(hour=7, minute=0, timezone=TZ),
        id="exam_reminders",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # Новая версия приложения — раз в 10 минут, днём (8:00–22:00), чтобы
    # уведомление не пришло ночью
    scheduler.add_job(
        _run_app_update_check,
        trigger=CronTrigger(hour="8-21", minute="*/10", timezone=TZ),
        id="app_update_check",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Сводка новых вариантов полных имён — раз в день в 13:00 (решение владельца)
    scheduler.add_job(
        _run_full_names_digest,
        trigger=CronTrigger(hour=13, minute=0, timezone=TZ),
        id="full_names_digest",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    scheduler.start()
    logger.info(
        "Планировщик запущен: проверка msu.tj от раз в 5 минут (суббота днём) "
        "до раз в 2 часа (ночью), напоминания об экзаменах ежедневно в 07:00, "
        "проверка новой версии приложения раз в 10 минут днём."
    )


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Планировщик остановлен.")
