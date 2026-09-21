"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // В разработке service worker только мешает: /_next/static/* он отдаёт
    // стратегией cache-first (см. public/sw.js), поэтому после правки стилей
    // браузер продолжает брать СТАРЫЙ CSS. Новые классы Tailwind в нём просто
    // отсутствуют, и вёрстка выглядит сломанной, хотя код уже другой —
    // на этом потеряли не один час. Ни перезапуск dev-сервера, ни удаление
    // .next воркер не трогают, он живёт в браузере.
    //
    // Поэтому в dev не регистрируем его вовсе и заодно сносим то, что осталось
    // от прошлых запусков, вместе с его кэшами.
    if (process.env.NODE_ENV !== "production") {
      const wasControlled = !!navigator.serviceWorker.controller;
      (async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        // Страница, открытая под управлением старого воркера, продолжает
        // получать его закэшированные ответы до перезагрузки — перезагружаем
        // один раз. Флаг в sessionStorage страхует от цикла.
        if (wasControlled && !sessionStorage.getItem("sw_dev_cleaned")) {
          sessionStorage.setItem("sw_dev_cleaned", "1");
          location.reload();
        }
      })().catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
