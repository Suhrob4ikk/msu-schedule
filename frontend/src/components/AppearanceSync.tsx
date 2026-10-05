"use client";
import { useEffect } from "react";
import { APPEARANCE_KEY, applyAppearance, readAppearance, saveAppearance } from "@/lib/appearance";

/**
 * Держит тему и акцент в актуальном состоянии после загрузки: первый раз их
 * ставит инлайновый скрипт в layout.tsx, а здесь — смена системной темы
 * (при «Авто»), выбор в другой вкладке и цвет полосы браузера.
 */
export default function AppearanceSync() {
  useEffect(() => {
    // Ключа ещё нет (старые настройки `theme` / `accent`) — сохраняем
    // перенесённые, чтобы все переключатели видели один и тот же выбор.
    let hasKey = true;
    try { hasKey = localStorage.getItem(APPEARANCE_KEY) !== null; } catch { /* приватный режим */ }
    if (hasKey) applyAppearance(readAppearance());
    else saveAppearance(readAppearance());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      const a = readAppearance();
      if (a.background === "system") applyAppearance(a);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === APPEARANCE_KEY) applyAppearance(readAppearance());
    };
    mq.addEventListener("change", onSystem);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onSystem);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
