/**
 * Оформление сайта: фон (как в системе / светлый / тёмный / чёрный) и акцент
 * (8 готовых цветов или свой). Формат ключа `appearance` — тот же, что в
 * мобильном приложении (src/appearanceModel.ts), старые ключи сайта `theme`
 * и `accent` переносятся.
 *
 * Акцент — четыре токена (ТЗ сайта, раздел 3): --fill (заливка), --ink (акцент
 * как текст и обводка), --ring (кольцо «сегодня»), --on-fill (текст на
 * заливке). --soft считается в CSS через color-mix от --fill.
 *
 * Модуль без "use client": таблица пресетов считается и на сервере — она
 * вшивается в инлайновый скрипт layout.tsx, который ставит тему и акцент до
 * первой отрисовки (без мигания).
 */
import { contrast, hexToOklch, oklchToHex, shiftL, shiftUntil, normalizeHex } from "./color";

export type Mode = "light" | "dark" | "black";
export type Background = "system" | Mode;

export type AccentPresetId = "blue" | "violet" | "emerald" | "teal" | "pink" | "orange" | "yellow" | "graphite";

export interface AccentVars { fill: string; ink: string; ring: string; onFill: string }

export interface Appearance {
  version: 1;
  accent: { preset: AccentPresetId | "custom"; custom: string | null };
  background: Background;
  /** Поля приложения (оттенки типов, плотность) — сайт их не меняет, но сохраняет. */
  [extra: string]: unknown;
}

export const DEFAULT_APPEARANCE: Appearance = {
  version: 1,
  accent: { preset: "blue", custom: null },
  background: "system",
};

/** Фон каждой темы: для полосы браузера (theme-color) и для расчёта акцента. */
export const MODE_BASE: Record<Mode, { bg: string; surface: string; chip: string }> = {
  light: { bg: "#F3F4F8", surface: "#FFFFFF", chip: "#EDEEF3" },
  dark: { bg: "#0E0F13", surface: "#17181D", chip: "#23242B" },
  black: { bg: "#000000", surface: "#0E0F12", chip: "#1A1B21" },
};

export const ACCENT_PRESETS: { id: AccentPresetId; name: string; hex: string }[] = [
  { id: "blue", name: "синий", hex: "#3F63DE" },
  { id: "violet", name: "фиолетовый", hex: "#7357F0" },
  { id: "emerald", name: "изумруд", hex: "#0E9B72" },
  { id: "teal", name: "бирюзовый", hex: "#418DA4" },
  { id: "pink", name: "розовый", hex: "#D6407F" },
  { id: "orange", name: "оранжевый", hex: "#E2702F" },
  { id: "yellow", name: "жёлтый", hex: "#F2C230" },
  { id: "graphite", name: "графит", hex: "#4D5566" },
];

/** Значения из таблицы ТЗ — для этих цветов формула не нужна. */
const SPEC_TABLE: Partial<Record<AccentPresetId, { light: AccentVars; dark: AccentVars }>> = {
  teal: {
    light: { fill: "#418DA4", ink: "#327387", ring: "#2B6273", onFill: "#00121D" },
    dark: { fill: "#4FA3BB", ink: "#6CC0D6", ring: "#8CD3E5", onFill: "#00121D" },
  },
  blue: {
    light: { fill: "#3F63DE", ink: "#2F52C4", ring: "#2443A8", onFill: "#FFFFFF" },
    dark: { fill: "#6F8FF5", ink: "#8EA8FF", ring: "#B0C2FF", onFill: "#0B1020" },
  },
  orange: {
    light: { fill: "#E2702F", ink: "#B04F16", ring: "#9A4412", onFill: "#1A0A00" },
    dark: { fill: "#F08446", ink: "#FF9E66", ring: "#FFC199", onFill: "#1A0A00" },
  },
};

/**
 * Текст на заливке: белый или тёмный того же оттенка — у кого контраст выше
 * (как «#00121D» у бирюзового в ТЗ). Если и он не дотягивает до 4,5 — чистые
 * белый или чёрный.
 */
function pickOnFill(fill: string): string {
  const c = hexToOklch(fill);
  const dark = oklchToHex({ l: 0.16, c: Math.min(c.c, 0.04), h: c.h });
  const w = contrast(fill, "#FFFFFF");
  const d = contrast(fill, dark);
  if (w >= d) return w >= 4.5 ? "#FFFFFF" : "#000000";
  return d >= 4.5 ? dark : "#000000";
}

/**
 * Правило ТЗ для остальных акцентов: --ink — акцент, сдвинутый по светлоте до
 * контраста ≥ 4,8 с карточкой и ≥ 4,5 с серой подложкой; --ring — ещё на шаг
 * дальше от фона; в тёмных темах заливка не темнее L 0,66, как у пресетов ТЗ.
 */
export function deriveAccent(hex: string, mode: Mode): AccentVars {
  const base = MODE_BASE[mode];
  const readable = (h: string) => contrast(h, base.surface) >= 4.8 && contrast(h, base.chip) >= 4.5;
  if (mode === "light") {
    const fill = hex.toUpperCase();
    const ink = shiftUntil(fill, false, readable);
    return { fill, ink, ring: shiftL(ink, -0.06), onFill: pickOnFill(fill) };
  }
  const c = hexToOklch(hex);
  const fill = c.l < 0.66 ? oklchToHex({ ...c, l: 0.66 }) : hex.toUpperCase();
  const ink = shiftUntil(shiftL(fill, 0.06), true, readable);
  return { fill, ink, ring: shiftL(ink, 0.08), onFill: pickOnFill(fill) };
}

export function presetVars(id: AccentPresetId, mode: Mode): AccentVars {
  const t = SPEC_TABLE[id];
  if (t) return mode === "light" ? t.light : t.dark;
  return deriveAccent(ACCENT_PRESETS.find(p => p.id === id)!.hex, mode);
}

/** Все пресеты во всех темах — для инлайнового скрипта. */
export function presetTable(): Record<string, Record<Mode, AccentVars>> {
  const out: Record<string, Record<Mode, AccentVars>> = {};
  for (const p of ACCENT_PRESETS) {
    out[p.id] = { light: presetVars(p.id, "light"), dark: presetVars(p.id, "dark"), black: presetVars(p.id, "black") };
  }
  return out;
}

export function accentHex(a: Appearance): string {
  if (a.accent.preset === "custom" && a.accent.custom) return a.accent.custom;
  return (ACCENT_PRESETS.find(p => p.id === a.accent.preset) ?? ACCENT_PRESETS[0]).hex;
}

export function accentVars(a: Appearance, mode: Mode): AccentVars {
  if (a.accent.preset === "custom" && a.accent.custom) return deriveAccent(a.accent.custom, mode);
  return presetVars(a.accent.preset === "custom" ? "blue" : a.accent.preset, mode);
}

// ─── Хранение ──────────────────────────────────────────────────────────────

export const APPEARANCE_KEY = "appearance";
/** Готовые токены своего цвета для всех тем — их читает инлайновый скрипт. */
export const CUSTOM_VARS_KEY = "appearance_vars";

const PRESET_IDS = ACCENT_PRESETS.map(p => p.id) as string[];
const BACKGROUNDS: Background[] = ["system", "light", "dark", "black"];

export function parseAppearance(raw: string | null): Appearance | null {
  if (!raw) return null;
  let o: Record<string, unknown> & { accent?: { preset?: unknown; custom?: unknown }; background?: unknown };
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const custom = typeof o.accent?.custom === "string" ? normalizeHex(o.accent.custom) : null;
  let preset = typeof o.accent?.preset === "string" && [...PRESET_IDS, "custom"].includes(o.accent.preset)
    ? (o.accent.preset as AccentPresetId | "custom") : "blue";
  if (preset === "custom" && !custom) preset = "blue";
  const background = BACKGROUNDS.includes(o.background as Background) ? (o.background as Background) : "system";
  return { ...o, version: 1, accent: { preset, custom }, background };
}

/** До «Табло»: `theme` (light/dark/system) и `accent` (blue/green). */
function migrateLegacy(): Appearance {
  let theme: string | null = null;
  let accent: string | null = null;
  try { theme = localStorage.getItem("theme"); accent = localStorage.getItem("accent"); } catch { /* приватный режим */ }
  const background: Background = theme === "light" || theme === "dark" ? theme : "system";
  return { ...DEFAULT_APPEARANCE, background, accent: { preset: accent === "green" ? "emerald" : "blue", custom: null } };
}

export function readAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(APPEARANCE_KEY)) ?? migrateLegacy();
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveMode(bg: Background): Mode {
  return bg === "system" ? (systemDark() ? "dark" : "light") : bg;
}

const VAR_NAMES: Record<keyof AccentVars, string> = { fill: "--fill", ink: "--ink", ring: "--ring", onFill: "--on-fill" };

/** Поставить тему и акцент на <html>. Синий в светлой и тёмной — значения по умолчанию из CSS. */
export function applyAppearance(a: Appearance): void {
  const root = document.documentElement;
  const mode = resolveMode(a.background);
  root.classList.toggle("dark", mode !== "light");
  root.classList.toggle("black", mode === "black");
  const vars = accentVars(a, mode);
  const isDefault = a.accent.preset === "blue";
  for (const k of Object.keys(VAR_NAMES) as (keyof AccentVars)[]) {
    if (isDefault) root.style.removeProperty(VAR_NAMES[k]);
    else root.style.setProperty(VAR_NAMES[k], vars[k]);
  }
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    m.removeAttribute("media");
    m.setAttribute("content", MODE_BASE[mode].bg);
  });
  window.dispatchEvent(new Event("appearance-change"));
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
    if (a.accent.preset === "custom" && a.accent.custom) {
      const c = a.accent.custom;
      localStorage.setItem(CUSTOM_VARS_KEY, JSON.stringify({
        light: deriveAccent(c, "light"), dark: deriveAccent(c, "dark"), black: deriveAccent(c, "black"),
      }));
    }
  } catch { /* приватный режим — оформление действует до перезагрузки */ }
  applyAppearance(a);
}

export const BACKGROUND_NAMES: Record<Background, string> = {
  system: "Авто", light: "Светлая", dark: "Тёмная", black: "Чёрная",
};

/**
 * Инлайновый скрипт для <head>: тема и акцент до первой отрисовки. Читает тот
 * же ключ, что applyAppearance; таблица пресетов вшита при сборке, свой цвет
 * берётся из CUSTOM_VARS_KEY.
 */
export function appearanceInitScript(): string {
  const table = JSON.stringify(presetTable());
  return `(function(){try{var P=${table};var d=document.documentElement,s=localStorage,a=null;try{a=JSON.parse(s.getItem('${APPEARANCE_KEY}')||'null')}catch(e){}var bg,pr;if(a&&a.version===1){bg=a.background;pr=a.accent&&a.accent.preset}else{var t=s.getItem('theme');bg=(t==='light'||t==='dark')?t:'system';pr=s.getItem('accent')==='green'?'emerald':'blue'}var m=(bg==='light'||bg==='dark'||bg==='black')?bg:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(m!=='light')d.classList.add('dark');if(m==='black')d.classList.add('black');var v=null;if(pr==='custom'){try{v=JSON.parse(s.getItem('${CUSTOM_VARS_KEY}')||'null');v=v&&v[m]}catch(e){}}else if(pr&&pr!=='blue'&&P[pr]){v=P[pr][m]}if(v){d.style.setProperty('--fill',v.fill);d.style.setProperty('--ink',v.ink);d.style.setProperty('--ring',v.ring);d.style.setProperty('--on-fill',v.onFill)}}catch(e){}})();`;
}
