"use client";
/**
 * День рождения особого человека (решение владельца, 11 окт 2026: эффектов — побольше).
 * При первом открытии сайта в этот день (раз в году, VIP_BDAY_KEY + год) — показ на
 * весь экран: салют из её металла, конфетти, карта вылетает с лентой «С днём рождения»,
 * поздравление «от администрации». Весь остальной день — конфетти (VipAmbient) и
 * праздничное приветствие (VipGreeting). Дата — VipInfo.birthday в lib/special.ts.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppearance, useVip } from "@/lib/tablo/hooks";
import { dushanbeNow } from "@/lib/tablo/schedule";
import { VIP_BDAY_KEY, isVipBirthday, metalOf, type MetalId } from "@/lib/special";
import { Star, reducedMotion } from "./effects";

const COLORS: Record<MetalId, string[]> = {
  gold: ["#f7d774", "#d4a017", "#fff4c7", "#ffb36b", "#ff9bd2"],
  platinum: ["#ffffff", "#d9dde3", "#b9bec7", "#cfe6ff", "#ffd6e0"],
  diamond: ["#ffffff", "#9fd6ff", "#ffb3ec", "#fff3a6", "#cfe0ff"],
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Один «залп» салюта: искры разлетаются по кругу и падают. */
function burst(box: HTMLElement, x: number, y: number, colors: string[]) {
  const n = 26;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.className = "vip-fw";
    const c = colors[i % colors.length];
    Object.assign(p.style, { left: `${x}px`, top: `${y}px`, background: c, boxShadow: `0 0 8px 2px ${c}` });
    box.appendChild(p);
    const a = (Math.PI * 2 * i) / n + rnd(-0.1, 0.1), d = rnd(70, 130);
    p.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.9)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${Math.cos(a) * d * 1.1}px, ${Math.sin(a) * d * 1.1 + 40}px) scale(.3)`, opacity: 0 },
    ], { duration: rnd(1300, 1700), easing: "cubic-bezier(.1,.7,.3,1)", fill: "forwards" }).onfinish = () => p.remove();
  }
  const flash = document.createElement("i");
  flash.className = "vip-fw-flash";
  Object.assign(flash.style, { left: `${x}px`, top: `${y}px` });
  box.appendChild(flash);
  flash.animate([{ transform: "scale(.2)", opacity: 0.9 }, { transform: "scale(1.6)", opacity: 0 }], { duration: 600, fill: "forwards" }).onfinish = () => flash.remove();
}

/** Конфетти сверху на весь экран. */
function confetti(box: HTMLElement, colors: string[], n: number) {
  const h = box.clientHeight;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.className = "vip-cf";
    Object.assign(p.style, { left: `${rnd(0, 100)}%`, background: colors[i % colors.length] });
    box.appendChild(p);
    p.animate([
      { transform: "translateY(-20px) rotate(0)", opacity: 1 },
      { transform: `translate(${rnd(-60, 60)}px, ${h + 30}px) rotate(${rnd(360, 900)}deg)`, opacity: 0.9 },
    ], { duration: rnd(2600, 4600), delay: rnd(0, 1200), easing: "cubic-bezier(.3,.2,.6,1)", fill: "both" }).onfinish = () => p.remove();
  }
}

export default function VipBirthday() {
  const vip = useVip();
  const path = usePathname();
  const metal = metalOf(useAppearance()) ?? "gold";
  const [show, setShow] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vip || path?.startsWith("/dev")) return;
    const now = dushanbeNow();
    if (!isVipBirthday(vip, now)) return;
    try {
      if (localStorage.getItem(VIP_BDAY_KEY) === String(now.getFullYear()) || !localStorage.getItem("selected_group_id")) return;
    } catch { return; }
    setShow(true);
  }, [vip, path]);

  useEffect(() => {
    const b = box.current;
    if (!show || !b) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = reducedMotion() ? 0 : 1;
    const q = (s: string) => b.querySelector<HTMLElement>(s);
    const colors = COLORS[metal];
    const timers: number[] = [];
    b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 * t, fill: "forwards" });
    if (t) {
      // салют: семь залпов в разных местах верхней половины, потом ещё волна
      for (let k = 0; k < 7; k++) {
        timers.push(window.setTimeout(() => burst(b, rnd(0.15, 0.85) * b.clientWidth, rnd(0.12, 0.42) * b.clientHeight, colors), 300 + k * 380));
      }
      timers.push(window.setTimeout(() => confetti(b, colors, 70), 900));
      for (let k = 0; k < 5; k++) {
        timers.push(window.setTimeout(() => burst(b, rnd(0.15, 0.85) * b.clientWidth, rnd(0.1, 0.35) * b.clientHeight, colors), 4200 + k * 700));
      }
    }
    q(".vip-bd-card")?.animate([
      { transform: "translateY(60px) scale(.5) rotateY(-180deg)", opacity: 0 },
      { transform: "translateY(0) scale(1.06) rotateY(15deg)", opacity: 1, offset: 0.75 },
      { transform: "none", opacity: 1 },
    ], { duration: 1100 * t, delay: 900 * t, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "both" });
    const fade = (el: HTMLElement | null, delay: number) =>
      el?.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 550 * t, delay: delay * t, easing: "ease-out", fill: "both" });
    fade(q(".vip-bd-hd"), 1900);
    fade(q(".vip-bd-title"), 2200);
    fade(q(".vip-bd-text"), 2700);
    fade(q(".vip-bd-btn"), 3300);
    return () => { timers.forEach(clearTimeout); document.body.style.overflow = prev; };
  }, [show, metal]);

  if (!show || !vip) return null;

  const close = () => {
    try { localStorage.setItem(VIP_BDAY_KEY, String(dushanbeNow().getFullYear())); } catch { /* приватный режим */ }
    const b = box.current;
    let done = false;
    const end = () => { if (!done) { done = true; setShow(false); } };
    if (!b || reducedMotion()) { end(); return; }
    b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: "forwards" }).onfinish = end;
    window.setTimeout(end, 650);
  };

  return (
    <div ref={box} className={`vip-bd vip-sp-t-${metal}`} role="dialog" aria-modal="true" aria-label="С днём рождения">
      <div className={`vip-bd-card vip-sp-card vip-sp-${metal} vip-sp-on`}>
        <span className="vip-sp-sh" />
        <span className="vip-sp-top"><span>МГУ · РАСПИСАНИЕ</span><span className="vip-sp-chip" /></span>
        <span className="vip-sp-who">
          <span className="vip-sp-no">№ {vip.number}</span>
          <span className="vip-sp-nm">{vip.name}</span>
          <span className="vip-sp-rl">{vip.role}</span>
        </span>
        <span className="vip-sp-ic"><Star /></span>
        <span className="vip-bd-ribbon">С ДНЁМ РОЖДЕНИЯ</span>
      </div>
      <div className="vip-bd-hd">УВЕДОМЛЕНИЕ ОТ АДМИНИСТРАЦИИ</div>
      <div className="vip-bd-title">С днём рождения,<br /><em>{vip.name}</em></div>
      <div className="vip-bd-text">Администрация поздравляет вас и объявляет сегодняшний день праздничным. Весь день — в конфетти.</div>
      <button type="button" className="vip-sp-go vip-bd-btn" onClick={close}>Спасибо</button>
    </div>
  );
}
