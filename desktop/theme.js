// Оформление виджета — те же темы и акценты, что на сайте (frontend/src/lib/appearance.ts
// и lib/color.ts). Здесь перенос на JS без изменений формул: меняете там — меняйте и тут.

const clamp01 = (x) => Math.min(1, Math.max(0, x));

function hexToRgb(hex) {
  const s = hex.replace("#", "");
  const n = parseInt(s.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbToHex(r, g, b) {
  const to = (x) => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: Math.hypot(A, B), h };
}
function oklchToLinear({ l: L, c, h }) {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb) => rgb.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
function oklchToHex(col) {
  const L = clamp01(col.l);
  let rgb = oklchToLinear({ ...col, l: L });
  if (!inGamut(rgb)) {
    let lo = 0, hi = col.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ l: L, c: mid, h: col.h }))) lo = mid; else hi = mid;
    }
    rgb = oklchToLinear({ l: L, c: lo, h: col.h });
  }
  const [r, g, b] = rgb.map((x) => fromLinear(clamp01(x)));
  return rgbToHex(r, g, b);
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function shiftL(hex, dl) {
  const c = hexToOklch(hex);
  return oklchToHex({ ...c, l: clamp01(c.l + dl) });
}
function shiftUntil(hex, lighter, ok) {
  let c = hexToOklch(hex);
  for (let i = 0; i < 50; i++) {
    const out = oklchToHex(c);
    if (ok(out)) return out;
    c = { ...c, l: clamp01(c.l + (lighter ? 0.02 : -0.02)) };
  }
  return lighter ? "#FFFFFF" : "#000000";
}

// ─── Темы и акценты ────────────────────────────────────────────────────────

const MODE_BASE = {
  light: { bg: "#F3F4F8", surface: "#FFFFFF", chip: "#EDEEF3", line: "#DEE3E9", text: "#121318", text2: "#4E5160" },
  dark: { bg: "#0E0F13", surface: "#17181D", chip: "#23242B", line: "#2A2C34", text: "#F1F2F5", text2: "#A7ABB6" },
  black: { bg: "#000000", surface: "#0E0F12", chip: "#1A1B21", line: "#24262D", text: "#F1F2F5", text2: "#A7ABB6" },
};

const ACCENT_PRESETS = [
  { id: "blue", name: "Синий", hex: "#3F63DE" },
  { id: "violet", name: "Фиолетовый", hex: "#7357F0" },
  { id: "emerald", name: "Изумруд", hex: "#0E9B72" },
  { id: "teal", name: "Бирюзовый", hex: "#418DA4" },
  { id: "pink", name: "Розовый", hex: "#D6407F" },
  { id: "orange", name: "Оранжевый", hex: "#E2702F" },
  { id: "yellow", name: "Жёлтый", hex: "#F2C230" },
  { id: "graphite", name: "Графит", hex: "#4D5566" },
];

const SPEC_TABLE = {
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

function pickOnFill(fill) {
  const c = hexToOklch(fill);
  const dark = oklchToHex({ l: 0.16, c: Math.min(c.c, 0.04), h: c.h });
  const w = contrast(fill, "#FFFFFF");
  const d = contrast(fill, dark);
  if (w >= d) return w >= 4.5 ? "#FFFFFF" : "#000000";
  return d >= 4.5 ? dark : "#000000";
}

function deriveAccent(hex, mode) {
  const base = MODE_BASE[mode];
  const readable = (h) => contrast(h, base.surface) >= 4.8 && contrast(h, base.chip) >= 4.5;
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

function presetVars(id, mode) {
  const t = SPEC_TABLE[id];
  if (t) return mode === "light" ? t.light : t.dark;
  return deriveAccent(ACCENT_PRESETS.find((p) => p.id === id).hex, mode);
}

/** Готовый набор CSS-переменных для окна: тема (light/dark/black) + акцент. */
function themeVars(mode, accentId) {
  const base = MODE_BASE[mode];
  const a = presetVars(ACCENT_PRESETS.some((p) => p.id === accentId) ? accentId : "blue", mode);
  return {
    "--bg": base.bg,
    "--surface": base.surface,
    "--line": base.line,
    "--text": base.text,
    "--text-2": base.text2,
    "--fill": a.fill,
    "--ink": a.ink,
    "--ring": a.ring,
    "--on-fill": a.onFill,
  };
}

module.exports = { ACCENT_PRESETS, themeVars };
