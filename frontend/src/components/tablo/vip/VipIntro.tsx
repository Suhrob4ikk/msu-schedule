"use client";
/**
 * Торжественное открытие «золотого профиля» — один раз на устройство
 * (VIP_INTRO_KEY). Чёрный экран, искры слетаются в звезду, звезда вспыхивает,
 * появляются имя и что сделано. Только у особых (lib/special.ts) и только
 * когда группа уже выбрана — на экране «Вход» не мешаем.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVip } from "@/lib/tablo/hooks";
import { VIP_INTRO_KEY } from "@/lib/special";
import { Star, reducedMotion, sparks } from "./effects";

export default function VipIntro() {
  const vip = useVip();
  const path = usePathname();
  const [show, setShow] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vip || path?.startsWith("/dev")) return;
    try {
      if (localStorage.getItem(VIP_INTRO_KEY) || !localStorage.getItem("selected_group_id")) return;
    } catch { return; }
    setShow(true);
  }, [vip, path]);

  useEffect(() => {
    const st = box.current;
    if (!show || !st) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const q = (s: string) => st.querySelector<HTMLElement>(s)!;
    const W = st.clientWidth, H = st.clientHeight;
    const star = q(".vip-bigstar").getBoundingClientRect();
    const cx = star.left + star.width / 2, cy = star.top + star.height / 2;
    const reduce = reducedMotion();
    const t = reduce ? 0 : 1;

    // искры со всех сторон слетаются к звезде
    sparks(st, Array.from({ length: 50 }, () => {
      const a = Math.random() * Math.PI * 2, d = Math.max(W, H) * (0.35 + Math.random() * 0.3);
      return [cx + Math.cos(a) * d, cy + Math.sin(a) * d, cx, cy] as [number, number, number, number];
    }), 1100, "cubic-bezier(.5,0,.7,.4)", 300);
    q(".vip-bigstar").animate(
      [{ opacity: 0, transform: "scale(.2) rotate(-90deg)" }, { opacity: 1, transform: "scale(1.25) rotate(10deg)", offset: 0.7 }, { opacity: 1, transform: "none" }],
      { duration: 700 * t, delay: 1150 * t, easing: "ease-out", fill: "forwards" },
    );
    // вспышка: искры разлетаются от звезды
    const flash = window.setTimeout(() => sparks(st, Array.from({ length: 26 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 26, d = 70 + Math.random() * 60;
      return [cx, cy, cx + Math.cos(a) * d, cy + Math.sin(a) * d] as [number, number, number, number];
    }), 900, "cubic-bezier(.1,.8,.3,1)"), 1500);
    const fade = (el: HTMLElement, delay: number) =>
      el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 600 * t, delay: delay * t, easing: "ease-out", fill: "forwards" });
    fade(q(".vip-rv-name"), 1700);
    fade(q(".vip-rv-line"), 2200);
    st.querySelectorAll<HTMLElement>(".vip-rv-list div").forEach((el, i) => fade(el, 2700 + i * 250));
    fade(q(".vip-rv-btn"), 3600);
    return () => { window.clearTimeout(flash); document.body.style.overflow = prev; };
  }, [show]);

  if (!show || !vip) return null;

  const close = () => {
    try { localStorage.setItem(VIP_INTRO_KEY, "1"); } catch { /* приватный режим */ }
    const st = box.current;
    if (!st) { setShow(false); return; }
    st.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: "forwards" }).onfinish = () => setShow(false);
  };

  return (
    <div ref={box} className="vip-intro" role="dialog" aria-modal="true" aria-label="Профиль обновлён">
      <div className="vip-intro-in">
        <div className="vip-bigstar"><Star /></div>
        <div className="vip-rv-name vip-gold-text">{vip.name}</div>
        <div className="vip-rv-line">Жалоба рассмотрена. Профиль обновлён.</div>
        <div className="vip-rv-list">
          <div><Star />Новый шрифт</div>
          <div><Star />Золотой профиль</div>
          <div><Star />И один секрет — найдите сами</div>
        </div>
        <button type="button" className="vip-gold-btn vip-rv-btn" onClick={close}>Посмотреть</button>
      </div>
    </div>
  );
}
