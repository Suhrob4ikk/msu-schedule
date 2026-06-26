"""Отправка Web Push уведомлений подписчикам группы."""

import json
import logging
from pywebpush import webpush, WebPushException

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_push(endpoint: str, keys_json: str, title: str, body: str, url: str = "/"):
    """Отправляет одно push-уведомление на endpoint."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return
    try:
        keys = json.loads(keys_json)
        webpush(
            subscription_info={"endpoint": endpoint, "keys": keys},
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
        )
    except WebPushException as e:
        # 404/410 — подписка протухла, удалять должен вызывающий код
        if e.response and e.response.status_code in (404, 410):
            raise
        logger.warning(f"Push ошибка: {e}")
    except Exception as e:
        logger.warning(f"Push ошибка: {e}")


def notify_group_changes(db, group_name: str, faculty_code: str, changes_count: int):
    """Отправляет уведомление всем подписчикам группы при изменении расписания."""
    from app.models import UserSubscription, Group

    groups = db.query(Group).filter(
        Group.name == group_name
    ).all()
    if not groups:
        return

    group_ids = [g.id for g in groups]
    subs = db.query(UserSubscription).filter(
        UserSubscription.group_id.in_(group_ids),
        UserSubscription.push_endpoint.isnot(None),
    ).all()

    label = f"{groups[0].year} курс · {group_name}"
    body = f"Изменений: {changes_count}" if changes_count == 1 else f"{changes_count} изменения в расписании"

    stale_ids = []
    for sub in subs:
        try:
            send_push(
                endpoint=sub.push_endpoint,
                keys_json=sub.push_keys,
                title=f"Расписание изменилось — {label}",
                body=body,
                url="/",
            )
        except WebPushException:
            stale_ids.append(sub.id)
        except Exception:
            pass

    # Чистим протухшие подписки
    if stale_ids:
        for sid in stale_ids:
            sub = db.get(UserSubscription, sid)
            if sub:
                sub.push_endpoint = None
                sub.push_keys = None
        db.commit()
