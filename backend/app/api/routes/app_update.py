"""Последняя версия мобильного приложения — для баннера «Доступно обновление».

Источник правды — GitHub Releases репозитория msu-schedule-mobile
(https://github.com/Suhrob4ikk/msu-schedule-mobile/releases). Ничего
не нужно вручную синхронизировать на бэкенде: при публикации нового
релиза (gh release create) это подхватится само при следующем запросе."""

import time
import logging
import httpx
from fastapi import APIRouter, HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app", tags=["app"])

GITHUB_REPO = "Suhrob4ikk/msu-schedule-mobile"

# Успешный ответ кэшируем надолго — релизы выходят не чаще раза в 1-2 недели.
_SUCCESS_TTL = 3600.0
# Если GitHub только что отказал (например, 403 rate limit на общий IP
# хостинга) — не долбим его повторно на каждый запрос пользователя,
# ждём хотя бы 5 минут перед следующей попыткой.
_RETRY_COOLDOWN = 300.0

_cache: dict = {"data": None, "ts": 0.0, "last_attempt": 0.0}


async def _fetch_latest_release() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    if settings.GITHUB_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_API_TOKEN}"

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

    version = data["tag_name"].lstrip("v")
    apk_asset = next(
        (a for a in data.get("assets", []) if a["name"].endswith(".apk")), None
    )
    return {
        "version": version,
        "download_url": apk_asset["browser_download_url"] if apk_asset else None,
        "notes": data.get("body") or "",
    }


@router.get("/version")
async def get_latest_version():
    """Последняя опубликованная версия мобильного приложения."""
    now = time.time()

    if _cache["data"] and (now - _cache["ts"]) < _SUCCESS_TTL:
        return _cache["data"]

    if (now - _cache["last_attempt"]) < _RETRY_COOLDOWN:
        if _cache["data"]:
            return _cache["data"]  # протухший, но лучше чем ошибка
        raise HTTPException(503, "Не удалось получить информацию о версии")

    _cache["last_attempt"] = now
    try:
        data = await _fetch_latest_release()
    except Exception as e:
        logger.warning(f"Не удалось получить версию приложения с GitHub: {e}")
        if _cache["data"]:
            return _cache["data"]
        raise HTTPException(503, "Не удалось получить информацию о версии")

    _cache["data"] = data
    _cache["ts"] = now
    return data
