"use client";
/**
 * Оформление в Кабинете: тема (Авто · Светлая · Тёмная · Чёрная) и акцент —
 * 8 готовых цветов и «Свой». Применяется сразу (lib/appearance.ts); тот же
 * ключ `appearance`, что в приложении. Вместо прежних ThemeSetting и
 * AccentSetting (синий / изумруд).
 */
import { useRef } from "react";
import { ACCENT_PRESETS, accentHex, presetVars, saveAppearance, resolveMode, type AccentPresetId } from "@/lib/appearance";
import { normalizeHex } from "@/lib/color";
import { useAppearance } from "@/lib/tablo/hooks";
import { ThemeSegment } from "./tablo/AvatarMenu";
import Icon from "./tablo/Icon";

export default function AppearanceSetting({ part = "all" }: { part?: "all" | "accent" }) {
  const a = useAppearance();
  const colorInput = useRef<HTMLInputElement>(null);
  if (!a) return null;
  const mode = resolveMode(a.background);

  const pick = (id: AccentPresetId) => saveAppearance({ ...a, accent: { ...a.accent, preset: id } });
  const pickCustom = (hex: string) => {
    const n = normalizeHex(hex);
    if (n) saveAppearance({ ...a, accent: { preset: "custom", custom: n } });
  };
  const customOn = a.accent.preset === "custom";

  return (
    <div className="card w-full">
      {part === "all" && (
        <>
          <p className="text-sm font-semibold mb-2.5" style={{ color: "var(--foreground)" }}>Тема</p>
          <ThemeSegment />
        </>
      )}
      <p className={`text-sm font-semibold mb-2.5 ${part === "all" ? "mt-4" : ""}`} style={{ color: "var(--foreground)" }}>Цвет акцента</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет акцента">
        {ACCENT_PRESETS.map(p => {
          const on = a.accent.preset === p.id;
          const v = presetVars(p.id, mode);
          return (
            <button key={p.id} type="button" role="radio" aria-checked={on} aria-label={`Акцент: ${p.name}`}
              title={p.name} onClick={() => pick(p.id)}
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ boxShadow: on ? "inset 0 0 0 2px var(--text)" : undefined }}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: v.fill, color: v.onFill }}>
                {on && <Icon name="check" size={20} strokeWidth={2.6} />}
              </span>
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={customOn} aria-label="Свой цвет" title="Свой цвет"
          onClick={() => colorInput.current?.click()}
          className="w-12 h-12 rounded-full flex items-center justify-center relative"
          style={{ boxShadow: customOn ? "inset 0 0 0 2px var(--text)" : undefined }}>
          <span className="w-9 h-9 rounded-full"
            style={{ background: customOn ? accentHex(a) : "conic-gradient(#f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)" }} />
          <input ref={colorInput} type="color" tabIndex={-1} aria-hidden="true"
            className="absolute inset-0 opacity-0 pointer-events-none"
            value={(customOn ? accentHex(a) : "#3F63DE").toLowerCase()}
            onChange={e => pickCustom(e.target.value)} />
        </button>
      </div>
    </div>
  );
}
