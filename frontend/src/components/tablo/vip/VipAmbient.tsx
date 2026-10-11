"use client";
/**
 * Живой слой уровней (решение владельца, 11 окт 2026) — только у особых (lib/special.ts),
 * на всех вкладках, кроме /dev:
 * - металл: золото — золотые пылинки, бриллиант — мерцающие искры;
 *   касание — золотые звёздочки / серебристая волна (платина) / россыпь искр;
 * - сезон (выбор во «Внешнем виде»: авто, зима, весна, осень, выкл) — снег, лепестки,
 *   листья в оттенках металла, без надписей;
 * - день рождения — весь день лёгкое конфетти;
 * - встряхнула телефон — сверху сыплются звёздочки её металла (пасхалка).
 * Слой поверх страницы, но под шапкой и меню, и не ловит нажатия (pointer-events: none).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppearance, useVip } from "@/lib/tablo/hooks";
import { dushanbeNow } from "@/lib/tablo/schedule";
import { activeSeason, isVipBirthday, metalOf, readVipSeason, type MetalId, type VipSeason } from "@/lib/special";
import { reducedMotion } from "./effects";

const STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6L2.5 9.1l6.6-.8z"/></svg>';
const TONES: Record<MetalId, { star: string[]; petal: string[]; leaf: string[]; confetti: string[] }> = {
  gold: { star: ["#f7d774", "#d4a017", "#fff4c7"], petal: ["#ffd6a8", "#ffe9b0", "#ffc7c7", "#fff4c7"], leaf: ["#d4a017", "#c56a1a", "#f7d774", "#a3461c"], confetti: ["#f7d774", "#d4a017", "#fff4c7", "#ff9bd2", "#9fd6ff"] },
  platinum: { star: ["#f1f3f6", "#b9bec7", "#ffffff"], petal: ["#f1f3f6", "#d9dde3", "#ffd6e0", "#e8f0ff"], leaf: ["#b9bec7", "#c98a4b", "#8b919c", "#d9a066"], confetti: ["#f1f3f6", "#b9bec7", "#8b919c", "#ffd6e0", "#cfe6ff"] },
  diamond: { star: ["#ffffff", "#cfe6ff", "#ffd6f5"], petal: ["#ffd6f5", "#cfe6ff", "#ffffff", "#ffe0f0"], leaf: ["#cfe0ff", "#e6a4c9", "#9fb3d9", "#f0c9a0"], confetti: ["#ffffff", "#9fd6ff", "#ffb3ec", "#fff3a6", "#cfe0ff"] },
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function fly(box: HTMLElement, el: HTMLElement, x: number, y: number, size: number, dist: number, i: number, n: number, dur: number) {
  Object.assign(el.style, { width: `${size}px`, height: `${size}px`, left: `${x - size / 2}px`, top: `${y - size / 2}px` });
  box.appendChild(el);
  const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = dist * (0.55 + Math.random() * 0.7);
  el.animate(
    [{ transform: "translate(0,0) scale(.3) rotate(0)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(1) rotate(${90 + Math.random() * 90}deg)`, opacity: 0 }],
    { duration: dur + Math.random() * 400, easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards" },
  ).onfinish = () => el.remove();
}

/** Звёздочки сыплются сверху — встряска телефона. */
export function starRain(box: HTMLElement, colors: string[]) {
  if (reducedMotion()) return;
  const h = window.innerHeight;
  for (let i = 0; i < 26; i++) {
    const s = document.createElement("div");
    const z = rnd(8, 20);
    s.className = "vip-tapstar"; s.innerHTML = STAR;
    Object.assign(s.style, { left: `${rnd(0, 100)}%`, top: "-24px", width: `${z}px`, height: `${z}px`, color: colors[i % colors.length] });
    box.appendChild(s);
    s.animate(
      [{ transform: "translateY(0) rotate(0)", opacity: 1 }, { transform: `translate(${rnd(-40, 40)}px, ${h + 40}px) rotate(${rnd(180, 540)}deg)`, opacity: 0.9 }],
      { duration: rnd(1400, 2600), delay: rnd(0, 500), easing: "cubic-bezier(.4,.1,.7,1)", fill: "both" },
    ).onfinish = () => s.remove();
  }
}

export default function VipAmbient() {
  const vip = useVip();
  const appearance = useAppearance();
  const path = usePathname();
  const metal = vip && !path?.startsWith("/dev") ? metalOf(appearance) : null;
  const tone = TONES[metal ?? "gold"];
  const box = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState<VipSeason>("auto");
  const [bday, setBday] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (!vip) return;
    const read = () => { setChoice(readVipSeason()); setNow(dushanbeNow()); setBday(isVipBirthday(vip, dushanbeNow())); };
    read();
    window.addEventListener("vip-season", read);
    return () => window.removeEventListener("vip-season", read);
  }, [vip]);

  const on = !!vip && !path?.startsWith("/dev");
  const season = on && now ? activeSeason(choice, now) : null;

  // Фон: места и ритм случайные, считаются один раз на металл / сезон
  const dust = useMemo(() => (metal === "gold" ? Array.from({ length: 12 }, () => ({
    left: `${rnd(0, 100)}%`, bottom: `${rnd(-5, 20)}%`, animationDuration: `${rnd(7, 13)}s`, animationDelay: `${-rnd(0, 12)}s`,
  })) : []), [metal]);
  const stars = useMemo(() => (metal === "diamond" ? Array.from({ length: 14 }, () => {
    const z = rnd(6, 15);
    return { width: z, height: z, left: `${rnd(0, 100)}%`, top: `${rnd(0, 100)}%`, animationDelay: `${rnd(0, 3)}s`, animationDuration: `${rnd(2.4, 4.6)}s` };
  }) : []), [metal]);
  const fall = useMemo(() => {
    const kind = bday ? "confetti" : season;
    if (!on || !kind) return [];
    const n = kind === "confetti" ? 30 : kind === "winter" ? 26 : 18;
    return Array.from({ length: n }, (_, i) => ({
      kind,
      style: {
        left: `${rnd(0, 100)}%`,
        animationDuration: `${kind === "confetti" ? rnd(4, 7) : rnd(7, 14)}s`,
        animationDelay: `${-rnd(0, 14)}s`,
        "--dx": `${rnd(-80, 80)}px`,
        "--rot": `${(Math.random() > 0.5 ? 1 : -1) * rnd(300, 600)}deg`,
        ...(kind === "winter" ? (() => { const z = metal === "diamond" ? rnd(7, 14) : rnd(2.5, 5.5); return { width: `${z}px`, height: `${z}px` }; })() : {}),
        ...(kind === "spring" ? { background: tone.petal[i % 4] } : kind === "autumn" ? { background: tone.leaf[i % 4] } : kind === "confetti" ? { background: tone.confetti[i % 5] } : {}),
      } as React.CSSProperties,
    }));
  }, [on, season, bday, metal, tone]);

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
          s.className = "vip-tapstar"; s.innerHTML = STAR; s.style.color = tone.star[i % 3];
          fly(b, s, x, y, rnd(9, 19), 60, i, 10, 850);
        }
      } else if (metal === "diamond") {
        for (let i = 0; i < 14; i++) {
          const s = document.createElement("div");
          s.className = "vip-spark vip-hit";
          fly(b, s, x, y, rnd(8, 20), 75, i, 14, 950);
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
  }, [metal, tone]);

  // Встряхнула телефон — сыплются звёздочки (пасхалка; на телефонах с датчиком движения)
  useEffect(() => {
    if (!on) return;
    let last = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const force = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      const t = Date.now();
      if (force > 28 && t - last > 2500 && box.current) {
        last = t;
        starRain(box.current, tone.star);
      }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [on, tone]);

  if (!on) return null;
  return (
    <div ref={box} className={`vip-amb vip-amb-${metal ?? "none"}`} aria-hidden="true">
      {dust.map((st, i) => <span key={`d${i}`} className="vip-dust" style={st} />)}
      {stars.map((st, i) => <span key={`s${i}`} className="vip-spark vip-tw" style={st} />)}
      {fall.map((f, i) => <span key={`f${f.kind}${i}`} className={`vip-fall vip-fall-${f.kind}`} style={f.style} />)}
    </div>
  );
}
