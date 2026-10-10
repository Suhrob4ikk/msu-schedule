/**
 * Общие части «золотого профиля» (lib/special.ts): звезда и разлёт звёздочек.
 * Анимации — Web Animations API на временных элементах, без React-состояния.
 */

export function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2.2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6L2.5 9.1l6.6-.8z" />
    </svg>
  );
}

const STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6L2.5 9.1l6.6-.8z"/></svg>';
const GOLDS = ["var(--gold-d)", "var(--gold)", "var(--gold-l)", "var(--gold)", "var(--gold-xl)"];

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Золотые звёздочки разлетаются из точки (x, y) внутри box (box — position: relative). */
export function burstStars(box: HTMLElement, x: number, y: number, n = 16, dist = 60) {
  if (reducedMotion()) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div");
    const s = 10 + Math.random() * 12;
    el.className = "vip-fly";
    el.innerHTML = STAR_SVG;
    Object.assign(el.style, { width: `${s}px`, height: `${s}px`, left: `${x - s / 2}px`, top: `${y - s / 2}px`, color: GOLDS[i % GOLDS.length] });
    box.appendChild(el);
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
    const d = dist + Math.random() * dist * 0.8;
    el.animate(
      [
        { transform: "translate(0,0) scale(.3)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) rotate(${Math.random() * 180}deg) scale(1)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 300, easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards" },
    ).onfinish = () => el.remove();
  }
}
