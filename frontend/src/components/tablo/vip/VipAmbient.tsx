"use client";
/**
 * Живой слой уровней (решение владельца, 11 окт 2026) — только у особых (lib/special.ts)
 * с выбранным металлом, на всех вкладках, кроме /dev:
 * - золото — снизу медленно поднимаются золотые пылинки, касание — золотые звёздочки;
 * - платина — касание — серебристая волна кругами;
 * - бриллиант — по экрану мерцают искры, касание — россыпь искр.
 * Слой поверх страницы, но под шапкой и меню, и не ловит нажатия (pointer-events: none).
 * Остальное оформление уровней — CSS в app/tablo-vip.css («Уровни»).
 */
import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAppearance, useVip } from "@/lib/tablo/hooks";
import { metalOf } from "@/lib/special";
import { reducedMotion } from "./effects";

const STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6L2.5 9.1l6.6-.8z"/></svg>';
const GOLDS = ["#f7d774", "#d4a017", "#fff4c7"];

function fly(box: HTMLElement, el: HTMLElement, x: number, y: number, size: number, dist: number, i: number, n: number, dur: number) {
  Object.assign(el.style, { width: `${size}px`, height: `${size}px`, left: `${x - size / 2}px`, top: `${y - size / 2}px` });
  box.appendChild(el);
  const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = dist * (0.55 + Math.random() * 0.7);
  el.animate(
    [{ transform: "translate(0,0) scale(.3) rotate(0)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(1) rotate(${90 + Math.random() * 90}deg)`, opacity: 0 }],
    { duration: dur + Math.random() * 400, easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards" },
  ).onfinish = () => el.remove();
}

export default function VipAmbient() {
  const vip = useVip();
  const appearance = useAppearance();
  const path = usePathname();
  const metal = vip && !path?.startsWith("/dev") ? metalOf(appearance) : null;
  const box = useRef<HTMLDivElement>(null);

  // Фон: места и ритм случайные, считаются один раз на металл
  const dust = useMemo(() => (metal === "gold" ? Array.from({ length: 12 }, () => ({
    left: `${Math.random() * 100}%`, bottom: `${-5 + Math.random() * 25}%`,
    animationDuration: `${7 + Math.random() * 6}s`, animationDelay: `${-Math.random() * 12}s`,
  })) : []), [metal]);
  const stars = useMemo(() => (metal === "diamond" ? Array.from({ length: 14 }, () => {
    const z = 6 + Math.random() * 9;
    return { width: z, height: z, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 3}s`, animationDuration: `${2.4 + Math.random() * 2.2}s` };
  }) : []), [metal]);

  // Эффект касания
  useEffect(() => {
    if (!metal) return;
    const onDown = (e: PointerEvent) => {
      const b = box.current;
      if (!b || reducedMotion() || !e.isPrimary) return;
      const x = e.clientX, y = e.clientY;
      if (metal === "gold") {
        for (let i = 0; i < 10; i++) {
          const s = document.createElement("div");
          s.className = "vip-tapstar"; s.innerHTML = STAR; s.style.color = GOLDS[i % 3];
          fly(b, s, x, y, 9 + Math.random() * 10, 60, i, 10, 850);
        }
      } else if (metal === "diamond") {
        for (let i = 0; i < 14; i++) {
          const s = document.createElement("div");
          s.className = "vip-spark vip-hit";
          fly(b, s, x, y, 8 + Math.random() * 12, 75, i, 14, 950);
        }
      } else {
        for (let k = 0; k < 3; k++) {
          const r = document.createElement("div");
          r.className = "vip-ripple";
          Object.assign(r.style, { left: `${x}px`, top: `${y}px`, width: "0px", height: "0px" });
          b.appendChild(r);
          r.animate(
            [{ width: "0px", height: "0px", marginLeft: "0px", marginTop: "0px", opacity: 0.9 }, { width: "180px", height: "180px", marginLeft: "-90px", marginTop: "-90px", opacity: 0 }],
            { duration: 850, delay: k * 130, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" },
          ).onfinish = () => r.remove();
        }
      }
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [metal]);

  if (!metal) return null;
  return (
    <div ref={box} className="vip-amb" aria-hidden="true">
      {dust.map((st, i) => <span key={`d${i}`} className="vip-dust" style={st} />)}
      {stars.map((st, i) => <span key={`s${i}`} className="vip-spark vip-tw" style={st} />)}
    </div>
  );
}
