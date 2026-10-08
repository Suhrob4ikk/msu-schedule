"""Ограничение частоты запросов, которые что-то пишут в базу (8 окт 2026).

Без него скрипт мог бы завести тысячи ненастоящих пользователей или завалить
опрос полных имён вариантами — утвердить их нельзя, но список «на проверке» и
письмо владельцу забились бы мусором, а база тратила бы бесплатные часы.

Как. Считаем POST/DELETE с одного адреса за минуту, отдельно по группам адресов.
Адрес — первый в X-Forwarded-For: его ставит Vercel (через него ходят и сайт, и
приложение). Прямо на Render адрес можно подделать — поэтому у самых опасных
действий есть ещё и общие лимиты (новые регистрации в user.py, новые варианты
имён в services/full_names.py), которые подменой адреса не обойти.

Лимиты щедрые: за одним адресом может сидеть весь Wi-Fi университета, а
приложение при каждом открытии отмечается на сервере (регистрация + push-токен).
Панель разработчика (/api/dev) и админка (/api/admin) — со своей защитой, мимо.
"""

import json
import time
from collections import deque

WINDOW = 60.0
# префикс пути → сколько запросов в минуту с одного адреса
LIMITS = [
    ("/api/names/", 30),
    ("/api/user/", 300),
]
_MAX_KEYS = 20000

_hits: dict = {}


def client_ip(scope) -> str:
    headers = dict(scope.get("headers") or [])
    fwd = headers.get(b"x-forwarded-for", b"").decode("latin-1")
    if fwd:
        return fwd.split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


def _limit_for(path: str):
    for prefix, limit in LIMITS:
        if path.startswith(prefix):
            return prefix, limit
    return None, None


def allow(key: tuple, limit: int, now: float) -> bool:
    q = _hits.get(key)
    if q is None:
        if len(_hits) >= _MAX_KEYS:
            _hits.clear()
        q = _hits[key] = deque()
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


class RateLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] in ("POST", "DELETE", "PUT", "PATCH"):
            prefix, limit = _limit_for(scope["path"])
            if prefix and not allow((prefix, client_ip(scope)), limit, time.monotonic()):
                body = json.dumps({"detail": "Слишком много запросов — попробуйте через минуту"},
                                  ensure_ascii=False).encode("utf-8")
                await send({"type": "http.response.start", "status": 429, "headers": [
                    (b"content-type", b"application/json; charset=utf-8"),
                    (b"content-length", str(len(body)).encode()),
                    (b"retry-after", b"60"),
                ]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)
