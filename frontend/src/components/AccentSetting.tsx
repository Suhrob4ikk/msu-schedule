"use client";

import { useEffect, useState } from "react";
import { getAccentPref, setAccentPref, type AccentPref } from "@/lib/theme";

const OPTIONS: Array<{ value: AccentPref; label: string; swatch: string }> = [
  { value: "green", label: "Изумруд", swatch: "#0e9b72" },
  { value: "blue", label: "Синий", swatch: "#2563eb" },
];

/**
 * Выбор акцентного цвета — отдельно от светлой/тёмной темы (см. ThemeSetting).
 * «Изумруд» — фирменный цвет, был всегда; «Синий» — альтернатива для тех,
 * кому такой акцент привычнее. На зелёный/красный статус «свободно»/«занято»
 * на аудиториях это не влияет — тот цвет задан отдельно.
 */
export default function AccentSetting() {
  // Нейтральное значение до монтирования: localStorage на сервере нет (#418).
  const [pref, setPref] = useState<AccentPref | null>(null);

  useEffect(() => {
    setPref(getAccentPref());
  }, []);

  if (pref === null) return null;

  const choose = (value: AccentPref) => {
    setAccentPref(value);
    setPref(value);
  };

  return (
    <div className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Цвет акцента</p>
      <p className="text-xs mt-0.5 mb-2.5" style={{ color: "var(--muted)" }}>
        Кнопки, активные вкладки и ссылки — «свободно»/«занято» на аудиториях этим цветом не красится
      </p>
      <div className="flex gap-1.5">
        {OPTIONS.map(o => {
          const active = pref === o.value;
          return (
            <button
              key={o.value}
              onClick={() => choose(o.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--tag-bg)] text-[var(--foreground)]"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: o.swatch, boxShadow: active ? "0 0 0 2px rgba(255,255,255,0.5)" : "none" }}
              />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
