// Устройство владельца (11 окт 2026): ключ в localStorage и инлайн-скрипт для layout.tsx.
// Без "use client" — скрипт вшивается на сервере. Сама проверка — components/OwnerSync.tsx.

export const OWNER_KEY = "owner_device";

/** Ставит класс `owner` на <html> до первой отрисовки, если прошлый ответ сервера был «да». */
export function ownerInitScript(): string {
  return `(function(){try{if(localStorage.getItem('${OWNER_KEY}')==='1')document.documentElement.classList.add('owner')}catch(e){}})();`;
}

/**
 * Формулы в глубине «космоса» владельца (он любит математику). Записаны HTML-ом с
 * настоящими верхними и нижними индексами — не «e^{iπ}» строкой (владелец, 11 окт 2026:
 * «чтобы таких ошибок не было»). Шрифт — STIX Two (layout.tsx): в обычных нет греческого,
 * и π, φ, ζ выпадали в чужой жирный шрифт. Классы: ow-lim — пределы столбиком у ∫ и ∑,
 * ow-up — прямые lim и det. Черту над корнем не рисуем: со знаком √ она стыкуется не везде.
 */
export const OWNER_FORMULAS: string[] = [
  "e<sup>iπ</sup> + 1 = 0",
  "∫<span class=\"ow-lim\"><sup>∞</sup><sub>0</sub></span> e<sup>−x²</sup> dx = √π / 2",
  "∑<span class=\"ow-lim\"><sup>∞</sup><sub>n=1</sub></span> 1/n² = π²/6",
  "φ = (1 + √5) / 2",
  "a² + b² = c²",
  "<span class=\"ow-up\">lim</span><sub>n→∞</sub> (1 + 1/n)<sup>n</sup> = e",
  "∇ · E = ρ / ε<sub>0</sub>",
  "ζ(s) = ∑ n<sup>−s</sup>",
  "<span class=\"ow-up\">det</span> A ≠ 0",
  "π",
  "∞",
  "i² = −1",
];
