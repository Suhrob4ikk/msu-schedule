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

export type ShadeId = "sky" | "lilac" | "amber" | "mint";
export type Density = "regular" | "compact";
/** Готовый оттенок или свой цвет в виде #RRGGBB. */
export type ShadeValue = ShadeId | `#${string}`;
export interface TypeShades { lecture: ShadeValue; practice: ShadeValue; exam: ShadeValue }
export const isCustomShade = (v: string): v is `#${string}` => v.startsWith("#");

export interface Appearance {
  version: 1;
  accent: { preset: AccentPresetId | "custom"; custom: string | null };
  background: Background;
  /** Оттенки бейджей «Лекция», «Практика», «Экзамен · Зачёт» (те же ключи, что в приложении). */
  types?: TypeShades;
  density?: Density;
  [extra: string]: unknown;
}

export const TYPE_SHADES: { id: ShadeId; name: string; hex: string }[] = [
  { id: "sky", name: "голубой", hex: "#4FB3FF" },
  { id: "lilac", name: "сиреневый", hex: "#9B87F5" },
  { id: "amber", name: "янтарный", hex: "#FF9640" },
  { id: "mint", name: "мятный", hex: "#2EC48A" },
];
export const DEFAULT_TYPES: TypeShades = { lecture: "sky", practice: "lilac", exam: "amber" };

export const DEFAULT_APPEARANCE: Appearance = {
  version: 1,
  accent: { preset: "blue", custom: null },
  background: "system",
  types: DEFAULT_TYPES,
  density: "regular",
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

// ─── Оттенки типов занятий ─────────────────────────────────────────────────

export interface ShadePair { bg: string; text: string }

/** Пары «фон / текст» для трёх готовых оттенков — как в приложении. */
const SHADE_TABLE: Partial<Record<ShadeId, Record<Mode, ShadePair>>> = {
  sky: {
    light: { bg: "#DDF0FF", text: "#0B5A8C" },
    dark: { bg: "#13314A", text: "#8CCBFF" },
    black: { bg: "#13314A", text: "#8CCBFF" },
  },
  lilac: {
    light: { bg: "#ECE7FF", text: "#5534C2" },
    dark: { bg: "#2B2350", text: "#C7B8FF" },
    black: { bg: "#2B2350", text: "#C7B8FF" },
  },
  amber: {
    light: { bg: "#FFE7D6", text: "#A33F00" },
    dark: { bg: "#47220F", text: "#FFB27A" },
    black: { bg: "#47220F", text: "#FFB27A" },
  },
};

function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const q = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${q(ar, br)}${q(ag, bg)}${q(ab, bb)}`.toUpperCase();
}

/** Для мятного — по правилу приложения: фон = смесь оттенка с карточкой, текст доведён до 4,5 : 1. */
export function shadePair(id: ShadeValue, mode: Mode): ShadePair {
  const t = isCustomShade(id) ? undefined : SHADE_TABLE[id];
  if (t) return t[mode];
  const hue = isCustomShade(id) ? id : TYPE_SHADES.find(x => x.id === id)!.hex;
  const bg = mixHex(MODE_BASE[mode].surface, hue, mode === "light" ? 0.16 : 0.22);
  return { bg, text: shiftUntil(hue, mode !== "light", h => contrast(h, bg) >= 4.5) };
}

// ─── Хранение ──────────────────────────────────────────────────────────────

export const APPEARANCE_KEY = "appearance";
/** Готовые токены своего цвета для всех тем — их читает инлайновый скрипт. */
export const CUSTOM_VARS_KEY = "appearance_vars";
/** Готовые пары «фон / текст» своих цветов типов для всех тем — их читает инлайновый скрипт. */
export const TYPE_VARS_KEY = "appearance_type_vars";

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
  const ids = TYPE_SHADES.map(x => x.id) as string[];
  const t = (o.types ?? {}) as Record<string, unknown>;
  const shade = (v: unknown, d: ShadeValue): ShadeValue => {
    if (typeof v !== "string") return d;
    if (ids.includes(v)) return v as ShadeId;
    const hex = normalizeHex(v);
    return hex ? (hex as ShadeValue) : d;
  };
  const types: TypeShades = {
    lecture: shade(t.lecture, DEFAULT_TYPES.lecture),
    practice: shade(t.practice, DEFAULT_TYPES.practice),
    exam: shade(t.exam, DEFAULT_TYPES.exam),
  };
  const density: Density = o.density === "compact" ? "compact" : "regular";
  return { ...o, version: 1, accent: { preset, custom }, background, types, density };
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
  applyTypes(root, a.types ?? DEFAULT_TYPES, mode);
  root.classList.toggle("compact", a.density === "compact");
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    m.removeAttribute("media");
    m.setAttribute("content", MODE_BASE[mode].bg);
  });
  window.dispatchEvent(new Event("appearance-change"));
}

const TYPE_VARS: Record<keyof TypeShades, string> = { lecture: "lec", practice: "lab", exam: "exam" };

/** Оттенки типов: по умолчанию — значения из CSS, остальные ставим на <html>. */
function applyTypes(root: HTMLElement, types: TypeShades, mode: Mode): void {
  for (const k of Object.keys(TYPE_VARS) as (keyof TypeShades)[]) {
    const v = TYPE_VARS[k];
    if (types[k] === DEFAULT_TYPES[k]) {
      root.style.removeProperty(`--${v}-bg`);
      root.style.removeProperty(`--${v}-text`);
    } else {
      const p = shadePair(types[k], mode);
      root.style.setProperty(`--${v}-bg`, p.bg);
      root.style.setProperty(`--${v}-text`, p.text);
    }
  }
}

/** Вернуть все настройки оформления к стандартным. */
export function resetAppearance(): void {
  saveAppearance({ ...DEFAULT_APPEARANCE, types: { ...DEFAULT_TYPES } });
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
    const custom: Record<string, Record<Mode, ShadePair>> = {};
    for (const k of Object.keys(a.types ?? {}) as (keyof TypeShades)[]) {
      const v = a.types![k];
      if (isCustomShade(v)) custom[k] = { light: shadePair(v, "light"), dark: shadePair(v, "dark"), black: shadePair(v, "black") };
    }
    localStorage.setItem(TYPE_VARS_KEY, JSON.stringify(custom));
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
  const shades: Record<string, Record<Mode, ShadePair>> = {};
  for (const x of TYPE_SHADES) shades[x.id] = { light: shadePair(x.id, "light"), dark: shadePair(x.id, "dark"), black: shadePair(x.id, "black") };
  const shadeTable = JSON.stringify(shades);
  return `(function(){try{var P=${table};var d=document.documentElement,s=localStorage,a=null;try{a=JSON.parse(s.getItem('${APPEARANCE_KEY}')||'null')}catch(e){}var bg,pr;if(a&&a.version===1){bg=a.background;pr=a.accent&&a.accent.preset}else{var t=s.getItem('theme');bg=(t==='light'||t==='dark')?t:'system';pr=s.getItem('accent')==='green'?'emerald':'blue'}var m=(bg==='light'||bg==='dark'||bg==='black')?bg:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(m!=='light')d.classList.add('dark');if(m==='black')d.classList.add('black');var v=null;if(pr==='custom'){try{v=JSON.parse(s.getItem('${CUSTOM_VARS_KEY}')||'null');v=v&&v[m]}catch(e){}}else if(pr&&pr!=='blue'&&P[pr]){v=P[pr][m]}if(v){d.style.setProperty('--fill',v.fill);d.style.setProperty('--ink',v.ink);d.style.setProperty('--ring',v.ring);d.style.setProperty('--on-fill',v.onFill)}var S=${shadeTable},T=a&&a.types;if(T){var D={lecture:'sky',practice:'lilac',exam:'amber'},N={lecture:'lec',practice:'lab',exam:'exam'};for(var k in N){var x=T[k];if(x&&x!==D[k]&&S[x]){var q=S[x][m];d.style.setProperty('--'+N[k]+'-bg',q.bg);d.style.setProperty('--'+N[k]+'-text',q.text)}else if(x&&x.charAt(0)==='#'){var C=JSON.parse(s.getItem('${TYPE_VARS_KEY}')||'{}'),q2=C[k]&&C[k][m];if(q2){d.style.setProperty('--'+N[k]+'-bg',q2.bg);d.style.setProperty('--'+N[k]+'-text',q2.text)}}}}if(a&&a.density==='compact')d.classList.add('compact')}catch(e){}})();`;
}
