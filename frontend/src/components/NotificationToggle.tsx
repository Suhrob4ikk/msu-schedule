"use client";

import { useState, useEffect } from "react";
import { api, getSessionId } from "@/lib/api";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function NotificationToggle() {
  const [status, setStatus] = useState<"loading" | "unsupported" | "denied" | "off" | "on">("loading");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const saved = localStorage.getItem("push_subscribed");
    setStatus(saved === "1" ? "on" : "off");
  }, []);

  const toggle = async () => {
    if (status === "on") {
      // Отключить
      const sessionId = getSessionId();
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await api.deletePushSubscription(sessionId);
      } catch {}
      localStorage.removeItem("push_subscribed");
      setStatus("off");
      return;
    }

    // Включить
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus("denied"); return; }

      const { public_key } = await api.getVapidKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });

      const groupId = Number(localStorage.getItem("selected_group_id") || "0");
      const sessionId = getSessionId();
      if (!groupId || !sessionId) return;

      await api.savePushSubscription(sessionId, groupId, sub.toJSON() as PushSubscriptionJSON);
      localStorage.setItem("push_subscribed", "1");
      setStatus("on");
    } catch (e) {
      console.error("Push subscribe error:", e);
    }
  };

  if (status === "loading" || status === "unsupported") return null;

  return (
    <button
      onClick={toggle}
      title={status === "denied" ? "Уведомления заблокированы в браузере" : undefined}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
        status === "on"
          ? "bg-[var(--primary)] text-white"
          : status === "denied"
          ? "bg-[var(--tag-bg)] text-[var(--muted)] cursor-not-allowed opacity-60"
          : "bg-[var(--tag-bg)] text-[var(--foreground)] hover:bg-[var(--border)]"
      }`}
      disabled={status === "denied"}
    >
      {status === "on" ? (
        <>
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 01-1.732-1h3.464A2 2 0 0110 18z"/>
          </svg>
          Уведомления вкл.
        </>
      ) : status === "denied" ? (
        <>
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524L13.477 14.89zm1.414-1.414L6.524 5.11A6 6 0 0114.89 13.476zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
          </svg>
          Уведомления заблокированы
        </>
      ) : (
        <>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
          </svg>
          Включить уведомления
        </>
      )}
    </button>
  );
}
