"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { getThemePref, watchSystemTheme, setThemePrefAnimated, type ThemePref } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemePref; label: string }> = [
  { value: "system", label: "Как в системе" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

/**
 * Выбор темы в кабинете — единственный переключатель на этой странице
 * (кнопка в шапке на кабинете скрыта, см. Header.tsx, чтобы не было двух
 * контролов одной настройки на одном экране). «Как в системе» — тема идёт
 * за настройкой телефона и переключается сама, когда та меняется.
 */
export default function ThemeSetting() {
  // Нейтральное значение до монтирования: localStorage на сервере нет (#418).
  const [pref, setPref] = useState<ThemePref | null>(null);

  useEffect(() => {
    setPref(getThemePref());
    // Пока выбрано «как в системе» — следим за сменой системной темы
    return watchSystemTheme(() => setPref(getThemePref()));
  }, []);

  if (pref === null) return null;

  const choose = (value: ThemePref, e: MouseEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setThemePrefAnimated(value, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
    setPref(value);
  };

  return (
    <div className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Тема</p>
      <p className="text-xs mt-0.5 mb-2.5" style={{ color: "var(--muted)" }}>
        «Как в системе» — приложение темнеет вместе с телефоном
      </p>
      <div className="flex gap-1.5">
        {OPTIONS.map(o => {
          const active = pref === o.value;
          return (
            <button
              key={o.value}
              onClick={e => choose(o.value, e)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--tag-bg)] text-[var(--foreground)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
