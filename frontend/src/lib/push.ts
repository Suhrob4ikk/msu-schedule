/**
 * Утилиты для Web Push уведомлений.
 * Используется в profile/page.tsx и page.tsx (баннер).
 */

import { api } from "./api";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
  return arr.buffer as ArrayBuffer;
}

export type PushStatus = "unsupported" | "default" | "granted" | "subscribed" | "denied";

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (localStorage.getItem("push_subscribed") === "1") return "subscribed";
  if (Notification.permission === "granted") return "granted";
  return "default";
}

export async function subscribePush(sessionId: string, groupId: number): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "default";

  try {
    const { public_key } = await api.getVapidKey();
    if (!public_key) return "unsupported"; // пуш не настроен на сервере — тихо выходим
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key),
    });

    await api.savePushSubscription(sessionId, groupId, sub.toJSON() as PushSubscriptionJSON);
    localStorage.setItem("push_subscribed", "1");
    return "subscribed";
  } catch (e) {
    console.error("Push subscribe failed:", e);
    return "granted";
  }
}

/**
 * Тихо напомнить серверу о своей подписке — без запроса разрешения.
 *
 * База на Render стирается при каждом деплое бэкенда, и подписка там
 * пропадала, а сайт продолжал считать себя подписанным (push_subscribed=1)
 * и больше её не присылал — уведомления молча переставали приходить.
 * Заодно так на сервер попадает текущая группа после её смены в кабинете.
 * Повторная отправка безопасна: сервер обновляет запись по session_id.
 */
export async function resyncPush(sessionId: string, groupId: number): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  if (localStorage.getItem("push_subscribed") !== "1" || Notification.permission !== "granted") return;

  try {
    // В dev service worker не регистрируется, и ready не дождаться никогда
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>(r => setTimeout(() => r(null), 5000)),
    ]);
    if (!reg) return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // Браузер подписку потерял, а разрешение осталось — подписываемся заново,
      // без окна с вопросом (разрешение уже дано).
      const { public_key } = await api.getVapidKey();
      if (!public_key) return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
    }
    await api.savePushSubscription(sessionId, groupId, sub.toJSON() as PushSubscriptionJSON);
  } catch {
    /* нет сети или браузер отказал — попробуем при следующем возврате */
  }
}

export async function unsubscribePush(sessionId: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    await api.deletePushSubscription(sessionId);
  } catch (e) {
    console.error("Push unsubscribe failed:", e);
  }
  localStorage.removeItem("push_subscribed");
}
