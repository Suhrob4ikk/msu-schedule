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

/** Прямой шрифт: lim, det, sin, tr — как принято в математическом наборе. */
const up = (s: string) => `<span class="ow-up">${s}</span>`;
/** Пределы столбиком у ∫ и ∑. */
const lim = (top: string, bottom: string) => `<span class="ow-lim"><sup>${top}</sup><sub>${bottom}</sub></span>`;

/**
 * Формулы в глубине «космоса» владельца (он любит математику). Записаны HTML-ом с
 * настоящими верхними и нижними индексами и дробями «этажами» — не «e^{iπ}» и не «1/n»
 * строкой (владелец, 11 окт 2026: «чтобы таких ошибок не было», потом — про дроби).
 * Разделы — матанализ, дифференциальные уравнения, алгебра (владелец, 11 окт 2026:
 * физику вроде ∇ · E убрать, этих — побольше).
 * Шрифт — STIX Two (layout.tsx): в обычных нет греческого, и π, φ, ζ выпадали в чужой
 * жирный шрифт. Классы: ow-lim — пределы столбиком у ∫ и ∑, ow-up — прямые lim и det,
 * ow-frac — дробь, ow-paren — высокие скобки. Черту над корнем не рисуем: со знаком √
 * она стыкуется не везде.
 */
export const OWNER_FORMULAS: string[] = [
  // классика
  "e<sup>iπ</sup> + 1 = 0",
  `φ = ${frac("1 + √5", "2")}`,
  "i² = −1",
  `ζ(s) = ∑ ${frac("1", "n<sup>s</sup>")}`,
  // матанализ
  `${up("lim")}<sub>x→0</sub> ${frac(`${up("sin")} x`, "x")} = 1`,
  `${up("lim")}<sub>n→∞</sub> ${big("(")}1 + ${frac("1", "n")}${big(")")}<sup>n</sup> = e`,
  `∫${lim("∞", "0")} e<sup>−x²</sup> dx = ${frac("√π", "2")}`,
  `∑${lim("∞", "n=1")} ${frac("1", "n²")} = ${frac("π²", "6")}`,
  `∫${lim("b", "a")} f′(x) dx = f(b) − f(a)`,
  `e<sup>x</sup> = ∑${lim("∞", "n=0")} ${frac("x<sup>n</sup>", "n!")}`,
  `∫ x<sup>n</sup> dx = ${frac("x<sup>n+1</sup>", "n + 1")} + C`,
  "(uv)′ = u′v + uv′",
  `${up("sin")}² x + ${up("cos")}² x = 1`,
  `f(x) ≈ f(a) + f′(a)(x − a)`,
  // дифференциальные уравнения
  `${frac("dy", "dx")} = ky`,
  "y = Ce<sup>kx</sup>",
  "y″ + ω²y = 0",
  "y″ + py′ + qy = 0",
  "λ² + pλ + q = 0",
  "y′ + p(x)y = q(x)",
  "y = (C<sub>1</sub> + C<sub>2</sub>x) e<sup>λx</sup>",
  // алгебра
  `${up("det")} A ≠ 0`,
  `${up("det")}(A − λE) = 0`,
  "Ax = λx",
  "AA<sup>−1</sup> = E",
  "(AB)<sup>T</sup> = B<sup>T</sup>A<sup>T</sup>",
  `${up("det")}(AB) = ${up("det")} A · ${up("det")} B`,
  `${up("rk")} A = n`,
  `x<sub>1,2</sub> = ${frac("−b ± √D", "2a")}`,
];
