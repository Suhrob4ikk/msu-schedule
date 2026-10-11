// Устройство владельца (11 окт 2026): ключ в localStorage и инлайн-скрипт для layout.tsx.
// Без "use client" — скрипт вшивается на сервере. Сама проверка — components/OwnerSync.tsx.

export const OWNER_KEY = "owner_device";

/** Ставит классы `owner` и `font-condensed` (узкий шрифт, как у «золотого профиля»;
 *  владелец, 11 окт 2026) на <html> до первой отрисовки, если прошлый ответ сервера был «да». */
export function ownerInitScript(): string {
  return `(function(){try{if(localStorage.getItem('${OWNER_KEY}')==='1')document.documentElement.classList.add('owner','font-condensed')}catch(e){}})();`;
}

/** Дробь «этажами»: числитель, черта, знаменатель (класс .ow-frac в tablo-owner.css). */
const frac = (num: string, den: string) => `<span class="ow-frac"><span>${num}</span><span>${den}</span></span>`;
/** Скобки во весь рост дроби. */
const big = (s: string) => `<span class="ow-paren">${s}</span>`;

/**
 * Формулы в глубине «космоса» владельца (он любит математику). Записаны HTML-ом с
 * настоящими верхними и нижними индексами и дробями «этажами» — не «e^{iπ}» и не «1/n»
 * строкой (владелец, 11 окт 2026: «чтобы таких ошибок не было», потом — про дроби).
 * Шрифт — STIX Two (layout.tsx): в обычных нет греческого, и π, φ, ζ выпадали в чужой
 * жирный шрифт. Классы: ow-lim — пределы столбиком у ∫ и ∑, ow-up — прямые lim и det,
 * ow-frac — дробь, ow-paren — высокие скобки. Черту над корнем не рисуем: со знаком √
 * она стыкуется не везде.
 */
export const OWNER_FORMULAS: string[] = [
  "e<sup>iπ</sup> + 1 = 0",
  `∫<span class="ow-lim"><sup>∞</sup><sub>0</sub></span> e<sup>−x²</sup> dx = ${frac("√π", "2")}`,
  `∑<span class="ow-lim"><sup>∞</sup><sub>n=1</sub></span> ${frac("1", "n²")} = ${frac("π²", "6")}`,
  `φ = ${frac("1 + √5", "2")}`,
  "a² + b² = c²",
  `<span class="ow-up">lim</span><sub>n→∞</sub> ${big("(")}1 + ${frac("1", "n")}${big(")")}<sup>n</sup> = e`,
  `∇ · E = ${frac("ρ", "ε<sub>0</sub>")}`,
  "ζ(s) = ∑ n<sup>−s</sup>",
  "<span class=\"ow-up\">det</span> A ≠ 0",
  "π",
  "∞",
  "i² = −1",
];
