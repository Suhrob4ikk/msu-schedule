"use client";
/**
 * Устройство владельца (11 окт 2026). Привязывается в панели /dev по паролю
 * («Мои устройства» → «Это моё устройство»); здесь сайт раз за открытие спрашивает
 * сервер (/user/owner) и ставит на <html> класс `owner`, а ответ запоминает в
 * localStorage (OWNER_KEY) — по нему инлайн-скрипт в layout.tsx ставит класс до
 * первой отрисовки. Права админа это не даёт: панель закрыта паролем на сервере.
 */
import { useEffect } from "react";
import { OWNER_KEY } from "@/lib/owner";

const API = process.env.NEXT_PUBLIC_API_URL!;

export default function OwnerSync() {
  useEffect(() => {
    let device = "";
    try { device = localStorage.getItem("msu_device_id_v2") ?? ""; } catch { return; }
    if (!device) return;
    fetch(`${API}/user/owner?device_id=${encodeURIComponent(device)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { owner: boolean } | null) => {
        if (!j) return;
        try { localStorage.setItem(OWNER_KEY, j.owner ? "1" : "0"); } catch { /* приватный режим */ }
        document.documentElement.classList.toggle("owner", j.owner);
        window.dispatchEvent(new Event("owner-change"));
      })
      .catch(() => { /* нет сети — остаётся то, что было */ });
  }, []);
  return null;
}
