/**
 * Цветовая математика без библиотек: OKLCH ⇄ sRGB, контраст WCAG, смесь.
 * Нужна, чтобы из любого цвета акцента вывести остальные акцентные токены
 * (см. lib/appearance.ts). Формулы OKLab — Björn Ottosson, контраст — WCAG 2.1.
 */

export interface Oklch { l: number; c: number; h: number }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  const full = s.length === 3 ? s.split("").map(ch => ch + ch).join("") : s;
  const n = parseInt(full.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/** OKLCH → линейный sRGB (может выйти за 0…1 — значит, вне охвата экрана). */
function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
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

const inGamut = (rgb: number[]) => rgb.every(x => x >= -1e-4 && x <= 1 + 1e-4);

/** OKLCH → HEX; если цвет не помещается в sRGB, насыщенность уменьшается
 *  (оттенок и светлота сохраняются) — как clampChroma в culori. */
export function oklchToHex(col: Oklch): string {
  const L = clamp01(col.l);
  let rgb = oklchToLinear({ ...col, l: L });
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = col.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ l: L, c: mid, h: col.h }))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear({ l: L, c: lo, h: col.h });
  }
  const [r, g, b] = rgb.map(x => fromLinear(clamp01(x)));
  return rgbToHex(r, g, b);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Сдвиг светлоты в OKLCH. */
export function shiftL(hex: string, dl: number): string {
  const c = hexToOklch(hex);
  return oklchToHex({ ...c, l: clamp01(c.l + dl) });
}

/** Двигать светлоту шагами по 0,02, пока ok() не выполнится. */
export function shiftUntil(hex: string, lighter: boolean, ok: (h: string) => boolean): string {
  let c = hexToOklch(hex);
  for (let i = 0; i < 50; i++) {
    const out = oklchToHex(c);
    if (ok(out)) return out;
    c = { ...c, l: clamp01(c.l + (lighter ? 0.02 : -0.02)) };
  }
  return lighter ? "#FFFFFF" : "#000000";
}

/** #abc / #aabbcc / aabbcc → #AABBCC; иначе null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) return ("#" + s.split("").map(ch => ch + ch).join("")).toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return ("#" + s).toUpperCase();
  return null;
}
