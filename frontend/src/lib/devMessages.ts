// Вопросы разработчику (11 окт 2026, вместо ссылки на Telegram владельца в Кабинете).
// Сервер — backend/app/services/dev_messages.py: сообщение привязано к устройству
// (msu_device_id_v2 регистрации), ответ владелец пишет в панели /dev.

const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

export type DevMessage = {
  id: number;
  text: string;
  anonymous: boolean;
  created_at: string | null;
  reply: string | null;
  replied_at: string | null;
};

export function myDeviceId(): string {
  try { return localStorage.getItem("msu_device_id_v2") ?? ""; } catch { return ""; }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, init);
  if (!r.ok) {
    let text = "Не удалось отправить — проверьте интернет";
    try { const j = await r.json(); if (typeof j.detail === "string") text = j.detail; } catch { /* не JSON */ }
    throw new Error(text);
  }
  return r.json();
}

const post = (body: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const loadMessages = (device: string) =>
  call<DevMessage[]>(`/user/messages?device_id=${encodeURIComponent(device)}`);

export const sendMessage = (device: string, text: string, anonymous: boolean) =>
  call<DevMessage>("/user/messages", post({ device_id: device, text, anonymous }));

export type UnreadInfo = { unread: number; id?: number; text?: string };

/** Сколько ответов не прочитано и текст последнего — сервер держит это в памяти. */
export const unreadInfo = (device: string) =>
  call<UnreadInfo>(`/user/messages/unread?device_id=${encodeURIComponent(device)}`).catch((): UnreadInfo => ({ unread: 0 }));

export const unreadReplies = (device: string) => unreadInfo(device).then(r => r.unread);

/** Ответ, баннер о котором уже показан или закрыт, — «id:начало текста» (DevReplyToast). */
export const REPLY_BANNER_KEY = "dev_reply_banner";

export const markRepliesSeen = (device: string) =>
  call<{ ok: boolean }>("/user/messages/seen", post({ device_id: device })).catch(() => null);

/** Время сервера — UTC без «Z». */
export function parseServerTime(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z");
  return isNaN(+d) ? null : d;
}

export function fmtMessageTime(d: Date | null): string {
  if (!d) return "";
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")}, ${time}`;
}
