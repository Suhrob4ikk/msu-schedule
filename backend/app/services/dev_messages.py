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
непрочитанных ответов и текст последнего (надпись в Кабинете и баннер «Ответ
разработчика» на любой странице — DevReplyToast) — в памяти: Neon должен днём спать.

С 13 окт 2026 это переписка, а не «вопрос — ответ»: сообщение разработчика — своя строка
(from_dev), их может быть несколько подряд, и их можно править. Панель собирает строки
устройства в переписку; анонимные — отдельной, иначе соседний вопрос с именем выдал бы автора.
"""
import logging
import threading
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
# device_id → {"n": сколько ответов не прочитано, "id": последний такой вопрос, "text": его ответ};
# None — ещё не загружали из базы
_unread: dict[str, dict] | None = None


class MessageError(Exception):
    def __init__(self, status: int, text: str):
        super().__init__(text)
        self.status = status
        self.text = text


def _unread_rows(db: Session, device_id: str | None = None):
    """Непрочитанные студентом сообщения разработчика, старые сначала."""
    q = db.query(DevMessage.device_id, DevMessage.id, DevMessage.text).filter(
        DevMessage.from_dev.is_(True), DevMessage.reply_seen.is_(False))
    if device_id is not None:
        q = q.filter(DevMessage.device_id == device_id)
    return q.order_by(DevMessage.created_at.asc(), DevMessage.id.asc()).all()


def _load_unread(db: Session) -> dict[str, dict]:
    global _unread
    if _unread is None:
        out: dict[str, dict] = {}
        for dev, mid, text in _unread_rows(db):
            n = out.get(dev, {}).get("n", 0) + 1
            out[dev] = {"n": n, "id": mid, "text": text}
        _unread = out
    return _unread


def _reload_unread(db: Session, device_id: str) -> None:
    """Перечитать одного студента из базы — после правки или удаления."""
    cache = _load_unread(db)
    cache.pop(device_id, None)
    rows = _unread_rows(db, device_id)
    if rows:
        cache[device_id] = {"n": len(rows), "id": rows[-1][1], "text": rows[-1][2]}


def unread_count(db: Session, device_id: str) -> int:
    return _load_unread(db).get(device_id, {}).get("n", 0)


def unread_info(db: Session, device_id: str) -> dict:
    """Для баннера: сколько непрочитанных, id и текст последнего сообщения разработчика."""
    u = _load_unread(db).get(device_id)
    return {"unread": u["n"], "id": u["id"], "text": u["text"][:200]} if u else {"unread": 0}


def _row(m: DevMessage) -> dict:
    return {
        "id": m.id,
        "text": m.text,
        "from_dev": bool(m.from_dev),
        "anonymous": m.name is None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "edited": m.edited_at is not None,
    }


def migrate_replies() -> int:
    """Старые ответы (поле reply) — в отдельные строки разработчика. Один раз при запуске
    (main.py); повторно делать нечего — reply после переноса пустой. Возвращает, сколько."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        old = db.query(DevMessage).filter(DevMessage.reply.isnot(None), DevMessage.from_dev.is_(False)).all()
        for m in old:
            db.add(DevMessage(device_id=m.device_id, name=m.name, group_label=m.group_label,
                              text=m.reply, created_at=m.replied_at or m.created_at,
                              reply_seen=m.reply_seen, from_dev=True))
            m.reply, m.replied_at = None, None
        db.commit()
        return len(old)
    finally:
        db.close()


def _quiet(reg: UserRegistration, group: Group | None) -> bool:
    """Без письма владельцу (просьба владельца 13 окт 2026): тестовые аккаунты («Тест …»)
    и сам владелец — «Сухроб» / «Suhrob» в ПМиИ 3. Однофамилец из другой группы письмо
    получит. Вопрос всё равно сохраняется и виден в панели. Проверяем по регистрации,
    а не по подписи: анонимный тест тоже без письма."""
    from app.api.routes.dev import is_owner_name
    from app.api.routes.user import _no_email_name
    if _no_email_name(reg.name or ""):
        return True
    return (is_owner_name(reg.name) and group is not None and group.year == 3
            and (group.name or "").lower().startswith("прикладная математика"))


def send(db: Session, device_id: str, text: str, anonymous: bool) -> tuple[dict, str, str, bool]:
    """Сохраняет вопрос. Возвращает (строку для клиента, подпись автора, группу, слать ли
    письмо) — для письма."""
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
    recent = db.query(DevMessage).filter(DevMessage.device_id == device_id, DevMessage.from_dev.is_(False),
                                         DevMessage.created_at >= day_ago).count()
    now = time.time()
    _times[:] = [t for t in _times if now - t < 3600]
    if recent >= PER_DEVICE_DAY or len(_times) >= PER_HOUR:
        raise MessageError(429, "Слишком много сообщений — попробуйте завтра")
    _times.append(now)

    group = db.get(Group, reg.group_id) if reg.group_id else None
    notify = not _quiet(reg, group)
    if anonymous:
        name, group_label = None, None
    else:
        name = (reg.name or "")[:200]
        group_label = f"{group.year} курс · {group.name}"[:200] if group else None
    m = DevMessage(device_id=device_id, name=name, group_label=group_label, text=text)
    db.add(m)
    db.commit()
    return _row(m), name or "Аноним", group_label or "", notify


# ─── Письмо владельцу: подряд идущие сообщения — одним письмом (13 окт 2026) ───
# Письмо уходит через EMAIL_QUIET_S после последнего сообщения переписки, но не позже
# EMAIL_MAX_WAIT_S после первого. Очередь — в памяти: деплой в эти минуты её теряет,
# но сообщения остаются в панели.
EMAIL_QUIET_S = 180
EMAIL_MAX_WAIT_S = 900
_mail_lock = threading.Lock()
# ключ переписки → {"author", "group", "items": [(время, текст)], "first": time, "timer"}
_mail_queue: dict[str, dict] = {}


def queue_email(thread: str, author: str, group_label: str, text: str) -> None:
    now = time.time()
    with _mail_lock:
        q = _mail_queue.get(thread)
        if q is None:
            q = _mail_queue[thread] = {"author": author, "group": group_label, "items": [], "first": now, "timer": None}
        q["items"].append((datetime.utcnow() + timedelta(hours=5), text))  # Душанбе, UTC+5
        if q["timer"]:
            q["timer"].cancel()
        delay = max(0.0, min(EMAIL_QUIET_S, q["first"] + EMAIL_MAX_WAIT_S - now))
        q["timer"] = threading.Timer(delay, _flush_email, args=(thread,))
        q["timer"].daemon = True
        q["timer"].start()


def _flush_email(thread: str) -> None:
    with _mail_lock:
        q = _mail_queue.pop(thread, None)
    if q:
        send_email(q["author"], q["group"], q["items"])


def send_email(author: str, group_label: str, items: list[tuple[datetime, str]]) -> None:
    from app.services.email import send_owner_email
    who = f"{author}{' · ' + group_label if group_label else ''}"
    n = len(items)
    subject = f"Вопрос с сайта — {author}" + (f" ({n} сообщ.)" if n > 1 else "")
    tail = "Ответить — в панели разработчика, раздел «Вопросы»."
    html = "".join(
        (f"<p style=\"color:#888;margin:12px 0 2px\">{t:%H:%M}</p>" if n > 1 else "")
        + f"<p style=\"white-space:pre-wrap;margin:0\">{escape(x)}</p>"
        for t, x in items)
    text = "\n\n".join((f"{t:%H:%M}\n" if n > 1 else "") + x for t, x in items)
    send_owner_email(
        subject,
        f"<p><b>{escape(author)}</b>{' · ' + escape(group_label) if group_label else ''}</p>{html}"
        f"<p style=\"color:#888;margin-top:16px\">{tail}</p>",
        f"{who}\n\n{text}\n\n{tail}",
    )


def my_messages(db: Session, device_id: str) -> list[dict]:
    """Переписка студента — последние 200 сообщений по порядку."""
    rows = (db.query(DevMessage).filter_by(device_id=device_id)
            .order_by(DevMessage.created_at.desc(), DevMessage.id.desc()).limit(200).all())
    return [_row(m) for m in reversed(rows)]


def mark_seen(db: Session, device_id: str) -> None:
    if not unread_count(db, device_id):
        return
    db.query(DevMessage).filter(
        DevMessage.device_id == device_id, DevMessage.from_dev.is_(True), DevMessage.reply_seen.is_(False),
    ).update({DevMessage.reply_seen: True}, synchronize_session=False)
    db.commit()
    _load_unread(db).pop(device_id, None)


# ─── Панель /dev ─────────────────────────────────────────────────────────────

def admin_list(db: Session) -> list[dict]:
    """Последние 300 сообщений, новые сверху. `thread` — ключ переписки: устройство и
    анонимно ли. Сообщения разработчика берут имя переписки, поэтому ключ у них тот же."""
    rows = (db.query(DevMessage).order_by(DevMessage.created_at.desc(), DevMessage.id.desc())
            .limit(300).all())
    return [{
        **_row(m),
        "thread": f"{m.device_id}:{'a' if m.name is None else 'n'}",
        "name": m.name or "Аноним",
        "group": m.group_label,
        "seen": bool(m.reply_seen),
    } for m in rows]


def _check_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        raise MessageError(400, "Напишите сообщение")
    if len(text) > MAX_LEN:
        raise MessageError(400, f"Слишком длинно — не больше {MAX_LEN} символов")
    return text


def _push(db: Session, device_id: str, text: str) -> bool:
    from app.services.push import send_push
    sub = db.query(UserSubscription).filter_by(session_id=device_id).first()
    if not sub or not sub.push_endpoint or not sub.push_keys:
        return False
    try:
        return send_push(sub.push_endpoint, sub.push_keys, "Ответ разработчика",
                         text[:120], url="/profile/messages", notif_type="dev-reply")
    except Exception:
        return False


def reply(db: Session, message_id: int, text: str) -> bool:
    """Новое сообщение разработчика в переписку того сообщения (любого в ней) и web-push
    студенту. True — уведомление ушло."""
    text = _check_text(text)
    m = db.get(DevMessage, message_id)
    if not m:
        raise MessageError(404, "Переписка не найдена")
    d = DevMessage(device_id=m.device_id, name=m.name, group_label=m.group_label,
                   text=text, from_dev=True, reply_seen=False)
    db.add(d)
    db.commit()
    cache = _load_unread(db)
    n = cache.get(d.device_id, {}).get("n", 0) + 1
    cache[d.device_id] = {"n": n, "id": d.id, "text": text}
    return _push(db, d.device_id, text)


def edit(db: Session, message_id: int, text: str) -> None:
    """Исправить своё сообщение. Студент увидит новый текст с пометкой «изменено»;
    уведомления нет — он уже знает, что ответ пришёл."""
    text = _check_text(text)
    m = db.get(DevMessage, message_id)
    if not m or not m.from_dev:
        raise MessageError(404, "Сообщение не найдено")
    if m.text == text:
        return
    m.text = text
    m.edited_at = datetime.utcnow()
    db.commit()
    _reload_unread(db, m.device_id)


def delete(db: Session, message_id: int) -> None:
    m = db.get(DevMessage, message_id)
    if not m:
        return
    dev = m.device_id
    db.delete(m)
    db.commit()
    _reload_unread(db, dev)
