"""Вопросы разработчику с сайта (11 окт 2026).

Решение владельца: вместо ссылки на его Telegram в Кабинете — форма «Написать
разработчику». Так его аккаунт не виден всем подряд, а студент может спросить,
не раскрывая себя: галочка «Не показывать моё имя» — тогда имя и группа не
сохраняются вовсе (в панели и в письме — «Аноним»).

Ответ владелец пишет в панели /dev; студент видит его в Кабинете → «Написать
разработчику» и получает web-push. Сообщение привязано к устройству (device_id
регистрации) — иначе ответ некому показать; полностью «ниоткуда» писать нельзя,
зато нельзя и заспамить.

База трогается только при отправке, открытии переписки и в панели. Счётчик
непрочитанных ответов (точка в Кабинете) — в памяти: Neon должен днём спать.
"""
import logging
import time
from datetime import datetime, timedelta
from html import escape

from sqlalchemy.orm import Session

from app.models import DevMessage, Group, UserRegistration, UserSubscription

logger = logging.getLogger(__name__)

MAX_LEN = 2000
PER_DEVICE_DAY = 5
PER_HOUR = 30

_times: list[float] = []
# device_id → сколько ответов ещё не прочитано; None — ещё не загружали из базы
_unread: dict[str, int] | None = None


class MessageError(Exception):
    def __init__(self, status: int, text: str):
        super().__init__(text)
        self.status = status
        self.text = text


def _load_unread(db: Session) -> dict[str, int]:
    global _unread
    if _unread is None:
        out: dict[str, int] = {}
        rows = db.query(DevMessage.device_id).filter(DevMessage.reply.isnot(None), DevMessage.reply_seen.is_(False)).all()
        for (dev,) in rows:
            out[dev] = out.get(dev, 0) + 1
        _unread = out
    return _unread


def unread_count(db: Session, device_id: str) -> int:
    return _load_unread(db).get(device_id, 0)


def _row(m: DevMessage) -> dict:
    return {
        "id": m.id,
        "text": m.text,
        "anonymous": m.name is None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "reply": m.reply,
        "replied_at": m.replied_at.isoformat() if m.replied_at else None,
    }


def send(db: Session, device_id: str, text: str, anonymous: bool) -> tuple[dict, str, str]:
    """Сохраняет вопрос. Возвращает (строку для клиента, подпись автора, группу) — для письма."""
    text = (text or "").strip()
    if not text:
        raise MessageError(400, "Напишите сообщение")
    if len(text) > MAX_LEN:
        raise MessageError(400, f"Слишком длинно — не больше {MAX_LEN} символов")
    if len(device_id) > 100:
        raise MessageError(400, "Слишком длинный device_id")
    reg = db.query(UserRegistration).filter_by(device_id=device_id).first()
    if not reg:
        raise MessageError(403, "Сначала выберите группу в Кабинете")

    day_ago = datetime.utcnow() - timedelta(days=1)
    recent = db.query(DevMessage).filter(DevMessage.device_id == device_id, DevMessage.created_at >= day_ago).count()
    now = time.time()
    _times[:] = [t for t in _times if now - t < 3600]
    if recent >= PER_DEVICE_DAY or len(_times) >= PER_HOUR:
        raise MessageError(429, "Слишком много сообщений — попробуйте завтра")
    _times.append(now)

    if anonymous:
        name, group_label = None, None
    else:
        group = db.get(Group, reg.group_id) if reg.group_id else None
        name = (reg.name or "")[:200]
        group_label = f"{group.year} курс · {group.name}"[:200] if group else None
    m = DevMessage(device_id=device_id, name=name, group_label=group_label, text=text)
    db.add(m)
    db.commit()
    return _row(m), name or "Аноним", group_label or ""


def send_email(author: str, group_label: str, text: str) -> None:
    from app.services.email import send_owner_email
    send_owner_email(
        f"Вопрос с сайта — {author}",
        f"<p><b>{escape(author)}</b>{' · ' + escape(group_label) if group_label else ''}</p>"
        f"<p style=\"white-space:pre-wrap\">{escape(text)}</p>"
        f"<p style=\"color:#888\">Ответить — в панели разработчика, раздел «Вопросы».</p>",
        f"{author}{' · ' + group_label if group_label else ''}\n\n{text}\n\nОтветить — в панели разработчика, раздел «Вопросы».",
    )


def my_messages(db: Session, device_id: str) -> list[dict]:
    rows = db.query(DevMessage).filter_by(device_id=device_id).order_by(DevMessage.created_at.asc()).limit(100).all()
    return [_row(m) for m in rows]


def mark_seen(db: Session, device_id: str) -> None:
    if not unread_count(db, device_id):
        return
    db.query(DevMessage).filter(
        DevMessage.device_id == device_id, DevMessage.reply.isnot(None), DevMessage.reply_seen.is_(False),
    ).update({DevMessage.reply_seen: True}, synchronize_session=False)
    db.commit()
    _load_unread(db).pop(device_id, None)


# ─── Панель /dev ─────────────────────────────────────────────────────────────

def admin_list(db: Session) -> list[dict]:
    rows = db.query(DevMessage).order_by(DevMessage.created_at.desc()).limit(100).all()
    return [{
        **_row(m),
        "name": m.name or "Аноним",
        "group": m.group_label,
        "reply_seen": bool(m.reply_seen),
    } for m in rows]


def reply(db: Session, message_id: int, text: str) -> bool:
    """Записывает ответ и шлёт студенту web-push. True — уведомление ушло."""
    from app.services.push import send_push

    text = (text or "").strip()
    if not text:
        raise MessageError(400, "Напишите ответ")
    if len(text) > MAX_LEN:
        raise MessageError(400, f"Слишком длинно — не больше {MAX_LEN} символов")
    m = db.get(DevMessage, message_id)
    if not m:
        raise MessageError(404, "Сообщение не найдено")
    was_unread = m.reply is not None and not m.reply_seen
    m.reply = text
    m.replied_at = datetime.utcnow()
    m.reply_seen = False
    db.commit()
    if not was_unread:
        cache = _load_unread(db)
        cache[m.device_id] = cache.get(m.device_id, 0) + 1

    sub = db.query(UserSubscription).filter_by(session_id=m.device_id).first()
    if not sub or not sub.push_endpoint or not sub.push_keys:
        return False
    try:
        return send_push(sub.push_endpoint, sub.push_keys, "Ответ разработчика",
                         text[:120], url="/profile/messages", notif_type="dev-reply")
    except Exception:
        return False


def delete(db: Session, message_id: int) -> None:
    m = db.get(DevMessage, message_id)
    if not m:
        return
    if m.reply is not None and not m.reply_seen:
        cache = _load_unread(db)
        left = cache.get(m.device_id, 0) - 1
        if left > 0:
            cache[m.device_id] = left
        else:
            cache.pop(m.device_id, None)
    db.delete(m)
    db.commit()
