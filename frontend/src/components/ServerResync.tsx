"use client";
import { useEffect } from "react";
import { api, revalidateCached } from "@/lib/api";
import { resyncPush } from "@/lib/push";

/** Не чаще раза в 30 минут — после деплоя этого хватает с запасом. */
const RESYNC_EVERY_MS = 30 * 60_000;
const RESYNC_KEY = "server_resync_at";

/**
 * Две фоновые обязанности, ничего не рисует.
 *
 * 1. Напомнить серверу о себе. База на Render стирается при каждом деплое
 *    бэкенда: сервер забывал регистрацию и web-push подписку, а сайт считал,
 *    что всё отправлено, — уведомления переставали приходить без единой
 *    ошибки. Теперь при открытии и возврате на вкладку (не чаще раза в 30 мин)
 *    тихо повторяем регистрацию (silent — без письма владельцу) и подписку.
 *
 * 2. Пришёл push («новая неделя», «изменения») — service worker сообщает
 *    открытым вкладкам, и они перезапрашивают данные сразу, не дожидаясь,
 *    пока протухнет кэш (см. revalidateCached в lib/api.ts).
 */
export default function ServerResync() {
  useEffect(() => {
    const resync = () => {
      if (document.hidden) return;
      try {
        const last = Number(localStorage.getItem(RESYNC_KEY) || 0);
        if (Date.now() - last < RESYNC_EVERY_MS) return;

        const groupId = Number(localStorage.getItem("selected_group_id"));
        if (!groupId) return; // ещё не выбрал группу — напоминать не о чем
        localStorage.setItem(RESYNC_KEY, String(Date.now()));

        // Один и тот же id и для регистрации, и для web-push подписки — его же
        // передаёт кабинет (NotificationToggle). Другой id завёл бы на сервере
        // вторую подписку того же браузера, и уведомления приходили бы дважды.
        const deviceId = localStorage.getItem("msu_device_id_v2");
        if (!deviceId) return;
        const name = localStorage.getItem("user_name")?.trim() || "Аноним";
        api.registerUser(deviceId, name, groupId, true);
        resyncPush(deviceId, groupId);
      } catch { /* localStorage недоступен — без перерегистрации */ }
    };

    resync();
    document.addEventListener("visibilitychange", resync);

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "push-received") revalidateCached();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      document.removeEventListener("visibilitychange", resync);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}

