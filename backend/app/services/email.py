"""Отправка email-уведомлений администратору через Resend API."""

import logging
import httpx
from app.core.config import settings

log = logging.getLogger(__name__)


def send_registration_email(name: str, group: str) -> None:
    """Отправляет письмо когда новый пользователь регистрируется."""
    if not settings.RESEND_API_KEY:
        log.warning("RESEND_API_KEY не настроен, письмо не отправлено")
        return

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <div style="background:#2563eb;border-radius:12px;padding:16px;margin-bottom:20px;display:inline-flex;align-items:center;gap:12px">
        <span style="color:#fff;font-weight:700;font-size:16px">МГУ</span>
        <span style="color:#ffffffcc;font-size:14px">Расписание занятий</span>
      </div>
      <h2 style="margin:0 0 12px;color:#111">Новый пользователь</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:10px 14px;background:#f5f5f0;border-radius:8px 8px 0 0;color:#555;font-size:13px;font-weight:600">ИМЯ</td>
          <td style="padding:10px 14px;background:#f5f5f0;border-radius:8px 8px 0 0;font-size:15px;font-weight:600">{name}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#ebebeb;border-radius:0 0 8px 8px;color:#555;font-size:13px;font-weight:600">ГРУППА</td>
          <td style="padding:10px 14px;background:#ebebeb;border-radius:0 0 8px 8px;font-size:15px">{group}</td>
        </tr>
      </table>
    </div>
    """

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={
                    "from": "МГУ Расписание <onboarding@resend.dev>",
                    "to": [settings.NOTIFY_EMAIL],
                    "subject": f"МГУ Расписание: новый пользователь — {name}",
                    "html": html,
                    "text": f"Новый пользователь: {name}\nГруппа: {group}",
                },
            )
            resp.raise_for_status()
        log.warning("Письмо отправлено через Resend: %s → %s", name, settings.NOTIFY_EMAIL)
    except Exception as e:
        log.error("Ошибка отправки письма через Resend: %s", e)
