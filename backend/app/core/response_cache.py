"""Кэш готовых ответов расписания в памяти сервера.

Зачем. Расписание меняется только при синхронизации с msu.tj, а спрашивают его
сотни раз в день — каждый раз одно и то же. Без кэша:

- база Neon не засыпает днём ни на минуту, а бесплатный тариф даёт ей около
  400 часов работы в месяц (100 CU-часов при 0,25 CU). Кончатся — Neon
  выключает базу до 1-го числа, и встаёт всё;
- после push «расписание изменилось» все телефоны группы разом просят
  /bulk-sync — и каждый запрос заново собирал бы ответ на 580 КБ.

Как. Ответ 200 на GET /api/schedule/* кладётся сюда целиком, уже сжатым,
и следующие такие же запросы отдаются без базы и без пересчёта. Одинаковые
запросы, пришедшие одновременно, ждут первый, а не считают каждый своё.

Когда сбрасывается. Синхронизация, изменившая расписание, и правки в /dev
вызывают clear_free_rooms_cache() — она поднимает номер «поколения», и все
записи старого поколения становятся недействительными. Плюс в ключ входит
сегодняшняя дата Душанбе: ответы, зависящие от даты (bulk-sync выбирает
«эту и следующую неделю»), в полночь пересчитываются сами. Плюс час —
страховка.
"""

import asyncio
import time
from datetime import datetime
from zoneinfo import ZoneInfo

_TZ = ZoneInfo("Asia/Dushanbe")
_TTL = 3600.0
_MAX_ENTRIES = 3000

_PREFIX = "/api/schedule/"
# Зависит от текущего времени, а не только от расписания
_SKIP = {"/api/schedule/now"}

# ключ → (поколение, время, status, headers, body)
_store: dict = {}
_locks: dict = {}


def _generation() -> int:
    from app.api.routes.schedule import _CACHE_GEN
    return _CACHE_GEN[0]


def cache_stats() -> dict:
    gen = _generation()
    return {"entries": sum(1 for e in _store.values() if e[0] == gen)}


class ResponseCacheMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (
            scope["type"] != "http"
            or scope["method"] != "GET"
            or not scope["path"].startswith(_PREFIX)
            or scope["path"] in _SKIP
        ):
            return await self.app(scope, receive, send)

        headers = dict(scope.get("headers") or [])
        gzip = b"gzip" in headers.get(b"accept-encoding", b"")
        today = datetime.now(_TZ).date().isoformat()
        key = (scope["path"], scope.get("query_string", b""), gzip, today)

        if await self._send_cached(key, send):
            return

        lock = _locks.setdefault(key, asyncio.Lock())
        try:
            await self._fill(key, scope, receive, send, lock)
        finally:
            _locks.pop(key, None)

    async def _fill(self, key, scope, receive, send, lock):
        async with lock:
            # Пока ждали, такой же запрос мог уже всё посчитать
            if await self._send_cached(key, send):
                return

            gen = _generation()
            start: dict = {}
            chunks: list[bytes] = []

            async def capture(message):
                if message["type"] == "http.response.start":
                    start.update(message)
                elif message["type"] == "http.response.body":
                    chunks.append(message.get("body", b""))
                await send(message)

            await self.app(scope, receive, capture)

            if start.get("status") == 200 and gen == _generation():
                # Старое поколение больше не понадобится — освобождаем память
                if len(_store) >= _MAX_ENTRIES or any(e[0] != gen for e in _store.values()):
                    _store.clear()
                _store[key] = (gen, time.monotonic(), 200,
                               list(start.get("headers", [])), b"".join(chunks))

    @staticmethod
    async def _send_cached(key, send) -> bool:
        hit = _store.get(key)
        if not hit or hit[0] != _generation() or time.monotonic() - hit[1] > _TTL:
            return False
        _, _, status, headers, body = hit
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})
        return True
