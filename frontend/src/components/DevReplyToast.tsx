"use client";
/**
 * Баннер «Ответ разработчика» сверху на любой странице (владелец, 11 окт 2026: «если я
 * ответил — пусть студенту приходит баннером»). Сервер держит в памяти, сколько ответов
 * не прочитано и текст последнего (GET /user/messages/unread — базу не будит), поэтому
 * спрашиваем свободно: при открытии сайта, при возврате на вкладку и когда service worker
 * получил push «dev-reply». Нажатие — в переписку (там ответ отмечается прочитанным),
 * крестик — закрыть. Один ответ показывается один раз (REPLY_BANNER_KEY), через 12 с
 * баннер уходит сам; «Новый ответ» в Кабинете остаётся, пока переписку не открыли.
 */
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/tablo/Icon";
import { REPLY_BANNER_KEY, myDeviceId, unreadInfo } from "@/lib/devMessages";

const SHOW_MS = 12_000;

export default function DevReplyToast() {
  const path = usePathname();
  const router = useRouter();
  const [reply, setReply] = useState<{ key: string; text: string; n: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hidden = !path || path.startsWith("/profile/messages") || path.startsWith("/dev");

  const check = useCallback(async () => {
    const dev = myDeviceId();
    if (!dev) return;
    const info = await unreadInfo(dev);
    if (!info.unread || !info.text || info.id == null) return;
    const key = `${info.id}:${info.text.slice(0, 40)}`;
    let shown = "";
    try { shown = localStorage.getItem(REPLY_BANNER_KEY) ?? ""; } catch { /* приватный режим */ }
    if (shown !== key) setReply({ key, text: info.text, n: info.unread });
  }, []);

  useEffect(() => {
    check();
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    const onSw = (e: MessageEvent) => { if (e.data?.type === "push-received" && e.data?.kind === "dev-reply") check(); };
    document.addEventListener("visibilitychange", onVis);
    navigator.serviceWorker?.addEventListener("message", onSw);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker?.removeEventListener("message", onSw);
    };
  }, [check]);

  const close = useCallback(() => {
    if (!reply) return;
    try { localStorage.setItem(REPLY_BANNER_KEY, reply.key); } catch { /* приватный режим */ }
    setLeaving(true);
    window.setTimeout(() => { setLeaving(false); setReply(null); }, 300);
  }, [reply]);

  // Открыл переписку сам — баннер больше не нужен
  useEffect(() => { if (reply && path?.startsWith("/profile/messages")) close(); }, [path, reply, close]);

  useEffect(() => {
    if (!reply || hidden) return;
    const t = window.setTimeout(close, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [reply, hidden, close]);

  if (!reply || hidden) return null;
  return (
    <div className={`t-reply-toast ${leaving ? "t-reply-toast-out" : ""}`} role="status">
      <button type="button" className="t-reply-main" onClick={() => { close(); router.push("/profile/messages"); }}>
        <span className="t-reply-ic"><Icon name="chat" size={22} /></span>
        <span className="t-reply-tx">
          <small>{reply.n > 1 ? `Ответ разработчика · ${reply.n}` : "Ответ разработчика"}</small>
          <b>{reply.text}</b>
        </span>
      </button>
      <button type="button" className="t-reply-x" aria-label="Закрыть" onClick={close}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
