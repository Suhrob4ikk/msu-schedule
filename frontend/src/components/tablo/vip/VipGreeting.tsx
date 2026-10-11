"use client";
/**
 * Приветствие на «Расписании» для особых (lib/special.ts): «Добрый вечер, Шахзода»,
 * в день рождения — «С днём рождения, Шахзода».
 * Пасхалка (11 окт 2026): задержать палец на имени — вокруг набегает кольцо, её карта
 * вылетает в центр экрана, крутится и возвращается; засчитывается секретное достижение.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppearance } from "@/lib/tablo/hooks";
import { isVipBirthday, metalOf, type MetalId, type VipInfo } from "@/lib/special";
import { Star, burstStars, reducedMotion } from "./effects";
import { vipSync } from "./VipTracker";

const HOLD_MS = 650;

function FlyCard({ vip, metal, onDone }: { vip: VipInfo; metal: MetalId; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const card = b.querySelector<HTMLElement>(".vip-sp-card")!;
    const t = reducedMotion() ? 0 : 1;
    b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 * t, fill: "forwards" });
    card.animate([
      { transform: "scale(.2) rotateY(0)", opacity: 0 },
      { transform: "scale(1.08) rotateY(360deg)", opacity: 1, offset: 0.35 },
      { transform: "scale(1) rotateY(360deg)", opacity: 1, offset: 0.8 },
      { transform: "scale(.2) rotateY(360deg)", opacity: 0 },
    ], { duration: 2600 * t, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" });
    const s = window.setTimeout(() => burstStars(b, b.clientWidth / 2, b.clientHeight / 2, 20, 150), 800 * t);
    const fade = window.setTimeout(() => {
      b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400 * t, fill: "forwards" });
    }, 2200 * t);
    const end = window.setTimeout(onDone, 2650 * t);
    return () => { clearTimeout(s); clearTimeout(fade); clearTimeout(end); };
  }, [onDone]);
  return createPortal(
    <div ref={box} className="vip-egg" aria-hidden="true">
      <div className={`vip-sp-card vip-sp-${metal} vip-sp-on`}>
        <span className="vip-sp-sh" />
        <span className="vip-sp-top"><span>МГУ · РАСПИСАНИЕ</span><span className="vip-sp-chip" /></span>
        <span className="vip-sp-who">
          <span className="vip-sp-no">№ {vip.number}</span>
          <span className="vip-sp-nm">{vip.name}</span>
          <span className="vip-sp-rl">{vip.role}</span>
        </span>
        <span className="vip-sp-ic"><Star /></span>
      </div>
    </div>,
    document.body,
  );
}

/** now — часы Душанбе (dushanbeNow), поэтому getHours() — местное время. */
export default function VipGreeting({ vip, now }: { vip: VipInfo; now: Date }) {
  const metal = metalOf(useAppearance()) ?? "gold";
  const [egg, setEgg] = useState(false);
  const [hold, setHold] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const eggDone = useCallback(() => setEgg(false), []);
  const h = now.getHours();
  const bday = isVipBirthday(vip, now);
  const hello = bday ? "С днём рождения" : h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";

  const stop = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; setHold(null); };
  const start = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (egg) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHold({ x: e.clientX - r.left, y: e.clientY - r.top });
    timer.current = window.setTimeout(() => {
      stop();
      setEgg(true);
      void vipSync(vip, ["secret"]);
    }, HOLD_MS);
  };

  return (
    <div className={`vip-greet ${bday ? "vip-greet-bday" : ""}`}>
      {hello},<br />
      <span className="vip-gold-text vip-greet-name" onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onContextMenu={e => e.preventDefault()}>
        {vip.name}
        {hold && <i className="vip-hold" style={{ left: hold.x, top: hold.y }} />}
      </span>
      {egg && <FlyCard vip={vip} metal={metal} onDone={eggDone} />}
    </div>
  );
}
