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
import { readAppearance } from "@/lib/appearance";

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
        const html = document.documentElement;
        html.classList.toggle("owner", j.owner);
        // узкий шрифт — как у «золотого профиля»; снимаем, только если его не держат «золотой
        // профиль» или собственный выбор во «Внешнем виде»
        if (j.owner) html.classList.add("font-condensed");
        else if (!html.classList.contains("vip") && readAppearance().font !== "condensed") html.classList.remove("font-condensed");
        window.dispatchEvent(new Event("owner-change"));
      })
      .catch(() => { /* нет сети — остаётся то, что было */ });
  }, []);
  return null;
}
