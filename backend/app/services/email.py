"""Отправка email-уведомлений администратору."""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

log = logging.getLogger(__name__)


def send_registration_email(name: str, group: str) -> None:
    """Отправляет письмо когда новый пользователь регистрируется."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        log.warning("SMTP не настроен, письмо не отправлено")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"МГУ Расписание: новый пользователь — {name}"
        msg["From"] = settings.SMTP_USER
        msg["To"] = settings.NOTIFY_EMAIL

        text = (
            f"Новый пользователь зарегистрировался в приложении МГУ Расписание:\n\n"
            f"Имя: {name}\n"
            f"Группа: {group}\n"
        )
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

        msg.attach(MIMEText(text, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        log.warning("Письмо отправлено: %s → %s", name, settings.NOTIFY_EMAIL)
    except Exception as e:
        log.error("Ошибка отправки письма: %s", e)
