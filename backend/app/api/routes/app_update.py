"""Последняя версия мобильного приложения — для баннера «Доступно обновление».

Источник правды — GitHub Releases репозитория msu-schedule-mobile
(https://github.com/Suhrob4ikk/msu-schedule-mobile/releases). Ничего
не нужно вручную синхронизировать на бэкенде: при публикации нового
релиза (gh release create) это подхватится само при следующем запросе."""

import re
import time
import logging
import httpx
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app", tags=["app"])

GITHUB_REPO = "Suhrob4ikk/msu-schedule-mobile"

# 5 минут: чтобы уведомление о новой версии доходило быстро после релиза.
# С токеном лимит GitHub — 5000 запросов/час, так что 12 запросов/час это ничто.
_SUCCESS_TTL = 300.0
# Если GitHub только что отказал (например, 403 rate limit на общий IP
# хостинга) — не долбим его повторно на каждый запрос пользователя,
# ждём хотя бы 5 минут перед следующей попыткой.
_RETRY_COOLDOWN = 300.0

# Кэшируем СПИСОК релизов: из него собирается и «последняя версия»,
# и накопленные заметки для конкретной установленной версии.
_cache: dict = {"releases": None, "ts": 0.0, "last_attempt": 0.0}


def parse_version(v: str) -> tuple:
    """«v1.9.10» → (1, 9, 10). Нечисловые куски игнорируем."""
    nums = re.findall(r"\d+", v or "")
    return tuple(int(n) for n in nums[:4])


async def _fetch_releases() -> list[dict]:
    """Все релизы, свежие сначала. Черновики и пре-релизы пропускаем."""
    headers = {"Accept": "application/vnd.github+json"}
    if settings.GITHUB_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_API_TOKEN}"

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases",
            headers=headers,
            params={"per_page": 30},
        )
        resp.raise_for_status()
        data = resp.json()

    releases = []
    for r in data:
        if r.get("draft") or r.get("prerelease"):
            continue
        version = (r.get("tag_name") or "").lstrip("v")
        if not version:
            continue
        apk = next((a for a in r.get("assets", []) if a["name"].endswith(".apk")), None)
        releases.append({
            "version": version,
            "download_url": apk["browser_download_url"] if apk else None,
            "notes": r.get("body") or "",
        })
    releases.sort(key=lambda r: parse_version(r["version"]), reverse=True)
    return releases


@router.get("/version")
async def get_latest_version(
    installed: Optional[str] = Query(
        None,
        description="Версия, установленная у пользователя («1.9.4»). "
                    "Если передана — вернём заметки ВСЕХ релизов новее неё.",
    ),
):
    """Последняя опубликованная версия мобильного приложения.

    Без `installed` ведём себя как раньше: отдаём заметки последнего релиза
    (так работают уже установленные старые версии приложения). С `installed`
    склеиваем заметки всех пропущенных релизов — чтобы человек видел, что
    нового именно с ТОЙ версии, которая стоит у него, а не только последнюю.
    """
    now = time.time()
    releases = _cache["releases"]

    if not releases or (now - _cache["ts"]) >= _SUCCESS_TTL:
        if (now - _cache["last_attempt"]) < _RETRY_COOLDOWN:
            if not releases:
                raise HTTPException(503, "Не удалось получить информацию о версии")
            # протухший кэш, но лучше чем ошибка
        else:
            _cache["last_attempt"] = now
            try:
                releases = await _fetch_releases()
                _cache["releases"] = releases
                _cache["ts"] = now
            except Exception as e:
                logger.warning(f"Не удалось получить версию приложения с GitHub: {e}")
                if not releases:
                    raise HTTPException(503, "Не удалось получить информацию о версии")

    if not releases:
        raise HTTPException(503, "Не удалось получить информацию о версии")

    latest = releases[0]
    notes = latest["notes"]
    missed_count = 0

    if installed:
        cur = parse_version(installed)
        # Только релизы строго новее установленного — их человек и пропустил
        missed = [r for r in releases if parse_version(r["version"]) > cur]
        if missed:
            missed_count = len(missed)
            if missed_count > 1:
                # Несколько пропущенных — показываем каждый со своим заголовком,
                # иначе непонятно, что из этого в какой версии появилось.
                notes = "\n\n".join(
                    f"### Версия {r['version']}\n{r['notes']}".rstrip()
                    for r in missed
                )
            else:
                notes = missed[0]["notes"]

    return {
        "version": latest["version"],
        "download_url": latest["download_url"],
        "notes": notes,
        # Сколько версий пропущено — чтобы приложение могло написать
        # «обновление через 3 версии». 0 — installed не передали.
        "missed_count": missed_count,
    }
