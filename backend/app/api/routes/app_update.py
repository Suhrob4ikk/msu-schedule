"""Последняя версия мобильного приложения — для баннера «Доступно обновление».

Источник правды — GitHub Releases репозитория msu-schedule-mobile
(https://github.com/Suhrob4ikk/msu-schedule-mobile/releases). Ничего
не нужно вручную синхронизировать на бэкенде: при публикации нового
релиза (gh release create) это подхватится само при следующем запросе."""

import time
import logging
import httpx
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app", tags=["app"])

GITHUB_REPO = "Suhrob4ikk/msu-schedule-mobile"

# GitHub API даёт 60 запросов/час анонимным клиентам — кэш на час с запасом
# (у нас один такой запрос на весь бэкенд, не на пользователя).
_CACHE: dict = {}
_CACHE_TTL = 3600.0


async def _fetch_latest_release() -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
            headers={"Accept": "application/vnd.github+json"},
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
    cached = _CACHE.get("data")
    if cached and (now - _CACHE.get("ts", 0)) < _CACHE_TTL:
        return cached

    try:
        data = await _fetch_latest_release()
    except Exception as e:
        logger.warning(f"Не удалось получить версию приложения с GitHub: {e}")
        if cached:
            return cached  # протухший кэш лучше, чем ошибка у пользователя
        raise HTTPException(503, "Не удалось получить информацию о версии")

    _CACHE["data"] = data
    _CACHE["ts"] = now
    return data
