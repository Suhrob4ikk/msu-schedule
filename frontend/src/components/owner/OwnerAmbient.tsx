"use client";
/**
 * «Космос + математика» на фоне всех вкладок у владельца (только привязанные в /dev
 * устройства, класс `owner`; решение владельца, 11 окт 2026): звёзды в три слоя
 * смещаются при наклоне телефона или за мышью (глубина), в глубине медленно плывут
 * формулы, иногда пролетает падающая звезда. Слой под шапкой и меню, нажатия не ловит.
 * Звёзды и падающие звёзды — только в тёмной теме. В светлой («Тетрадь в клетку»,
 * выбор владельца из демо v2) вместо звёзд — точки графика, соединённые пунктиром.
 */
import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useOwner } from "@/lib/tablo/hooks";
import { OWNER_FORMULAS } from "@/lib/owner";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export default function OwnerAmbient() {
  const owner = useOwner();
  const path = usePathname();
  const on = owner && !path?.startsWith("/dev");
  const box = useRef<HTMLDivElement>(null);

  // формулы перемешаны один раз и берутся по порядку — без повторов на экране
  const layers = useMemo(() => {
    if (!on) return [];
    const pick = [...OWNER_FORMULAS].sort(() => Math.random() - 0.5);
    return [0, 1, 2].map(i => ({
      stars: Array.from({ length: 34 - i * 9 }, () => {
        const z = rnd(0.8, 1.6) + i * 0.6;
        return { left: `${rnd(0, 100)}%`, top: `${rnd(0, 100)}%`, width: z, height: z, opacity: rnd(0.35, 0.95) };
      }),
      formulas: i < 2 ? Array.from({ length: 3 }, (_, k) => ({
        html: pick[i * 3 + k],
        style: { left: `${rnd(4, 62)}%`, top: `${rnd(10 + k * 28, 30 + k * 28)}%`, fontSize: `${(i === 0 ? 15 : 21) + rnd(0, 6)}px`, animationDuration: `${rnd(22, 36)}s`, animationDirection: k % 2 ? "alternate" : "alternate-reverse" },
      })) : [],
    }));
  }, [on]);

  // точки графика для светлой темы: 3 ломаные по 5 точек, в пикселях окна (слой рисуется только на клиенте)
  const graph = useMemo(() => {
    if (!on) return [];
    const w = window.innerWidth, h = window.innerHeight;
    return Array.from({ length: 3 }, () => {
      let x = rnd(0.1, 0.85) * w, y = rnd(0.1, 0.9) * h;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 4; k++) { x += rnd(-50, 60); y += rnd(-50, 50); pts.push([x, y]); }
      return pts;
    });
  }, [on]);

  // глубина: слои смещаются за мышью / наклоном
  useEffect(() => {
    if (!on) return;
    const els = () => box.current?.querySelectorAll<HTMLElement>(".ow-layer") ?? [];
    const move = (px: number, py: number) => els().forEach((l, i) => { l.style.transform = `translate(${(px - 0.5) * -(i + 1) * 12}px, ${(py - 0.5) * -(i + 1) * 12}px)`; });
    const onPtr = (e: PointerEvent) => move(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    const onOri = (e: DeviceOrientationEvent) => { if (e.gamma != null && e.beta != null) move(0.5 + e.gamma / 90, 0.5 + (e.beta - 45) / 90); };
    window.addEventListener("pointermove", onPtr, { passive: true });
    window.addEventListener("deviceorientation", onOri);
    return () => { window.removeEventListener("pointermove", onPtr); window.removeEventListener("deviceorientation", onOri); };
  }, [on]);

  // падающая звезда — раз в несколько секунд, только в тёмной теме
  useEffect(() => {
    if (!on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const b = box.current;
      if (!b || !document.documentElement.classList.contains("dark") || document.hidden) return;
      const s = document.createElement("span");
      s.className = "ow-shoot";
      Object.assign(s.style, { left: `${rnd(45, 100)}%`, top: `${rnd(0, 35)}%` });
      b.appendChild(s);
      s.animate(
        [{ opacity: 0, transform: "rotate(-30deg) translateX(0)" }, { opacity: 1, offset: 0.2 }, { opacity: 0, transform: "rotate(-30deg) translateX(-280px)" }],
        { duration: 1100, easing: "ease-out" },
      ).onfinish = () => s.remove();
    }, 6500);
    return () => window.clearInterval(id);
  }, [on]);

  if (!on) return null;
  return (
    <div ref={box} className="ow-amb" aria-hidden="true">
      <svg className="ow-graph">
        {graph.map((pts, i) => (
          <g key={i}>
            <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke="rgba(31,86,214,.18)" strokeWidth="1.2" strokeDasharray="3 3" />
            {pts.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="2.6" fill="rgba(31,86,214,.3)" />)}
          </g>
        ))}
      </svg>
      {layers.map((l, i) => (
        <div key={i} className="ow-layer">
          {l.stars.map((st, k) => <span key={k} className={`ow-st ${i === 2 ? "ow-st-big" : ""}`} style={st} />)}
          {l.formulas.map((f, k) => <span key={`f${k}`} className="ow-formula" style={f.style} dangerouslySetInnerHTML={{ __html: f.html }} />)}
        </div>
      ))}
    </div>
  );
}
