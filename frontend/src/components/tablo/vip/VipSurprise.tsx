"use client";
/**
 * Сюрприз «ещё два оформления» (решение владельца, 11 окт 2026) — один раз на
 * устройство (VIP_SURPRISE_KEY), только у особых (lib/special.ts) с выбранной группой.
 * Золотая карта выезжает в центр, из-за неё со вспышкой выходят бриллиантовая и
 * платиновая. Нажатие на карту — примерить; «Выбрать …» сразу меняет оформление сайта.
 * «Оставить золото» / «Посмотрю потом» — метка «Новое» на «Внешнем виде» (VIP_NEW_KEY).
 * Тексты — шутливо-«официальные», без романтики (решение владельца).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVip } from "@/lib/tablo/hooks";
import { readAppearance, saveAppearance } from "@/lib/appearance";
import { METALS, VIP_NEW_KEY, VIP_SURPRISE_KEY, metalOf, type MetalId, type VipInfo } from "@/lib/special";
import { Star, reducedMotion } from "./effects";

// У каждой карты своё место; выбранная выходит вперёд и чуть крупнее, остальные притухают.
const POS: Record<MetalId, string> = {
  gold: "translate(0, 6px) rotate(0)",
  diamond: "translate(78px, -6px) rotate(10deg)",
  platinum: "translate(-78px, -6px) rotate(-10deg)",
};
const at = (id: MetalId, big: boolean) => `${POS[id]} scale(${big ? 1.02 : 0.86})`;
const LABEL: Record<MetalId, string> = { gold: "уже у вас", diamond: "белый металл с искрами", platinum: "шлифованное серебро" };
const ORDER: MetalId[] = ["platinum", "gold", "diamond"];

function Gem() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor" opacity=".35" />
      <path d="M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 6 3-6M12 21 9 9M12 21l3-12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Искры-крестики разлетаются из точки (x, y) внутри box. */
function sparks(box: HTMLElement, x: number, y: number, n: number, dist: number) {
  if (reducedMotion()) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    const sz = 8 + Math.random() * 13;
    s.className = "vip-spark vip-sp-burst";
    Object.assign(s.style, { width: `${sz}px`, height: `${sz}px`, left: `${x - sz / 2}px`, top: `${y - sz / 2}px` });
    box.appendChild(s);
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = dist * (0.55 + Math.random() * 0.7);
    s.animate(
      [{ transform: "translate(0,0) scale(.2) rotate(0)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(1) rotate(90deg)`, opacity: 0 }],
      { duration: 900 + Math.random() * 500, easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards" },
    ).onfinish = () => s.remove();
  }
}

function MiniCard({ id, vip, on, onPick }: { id: MetalId; vip: VipInfo; on: boolean; onPick: (id: MetalId) => void }) {
  return (
    <button type="button" data-id={id} className={`vip-sp-card vip-sp-${id} ${on ? "vip-sp-on" : ""}`}
      aria-label={METALS[id].name} aria-pressed={on} onClick={() => onPick(id)}>
      <span className="vip-sp-sh" />
      <span className="vip-sp-top"><span>МГУ · РАСПИСАНИЕ</span><span className="vip-sp-chip" /></span>
      <span className="vip-sp-who">
        <span className="vip-sp-no">№ {vip.number}</span>
        <span className="vip-sp-nm">{vip.name}</span>
        <span className="vip-sp-rl">{vip.role}</span>
      </span>
      <span className="vip-sp-ic">{id === "diamond" ? <Gem /> : <Star />}</span>
    </button>
  );
}

export default function VipSurprise() {
  const vip = useVip();
  const path = usePathname();
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false); // вступление закончилось — можно выбирать
  const [chosen, setChosen] = useState<MetalId>("gold");
  const [toast, setToast] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const deck = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vip || path?.startsWith("/dev")) return;
    try {
      if (localStorage.getItem(VIP_SURPRISE_KEY) || !localStorage.getItem("selected_group_id")) return;
    } catch { return; }
    setChosen(metalOf(readAppearance()) ?? "gold");
    setShow(true);
  }, [vip, path]);

  // Вступление: заголовок, золото в центр, бриллиант и платина выходят из-за него.
  useEffect(() => {
    const ov = box.current, dk = deck.current;
    if (!show || !ov || !dk) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = reducedMotion() ? 0 : 1;
    const q = (s: string) => ov.querySelector<HTMLElement>(s);
    const card = (id: MetalId) => dk.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    const fade = (el: HTMLElement | null, delay: number) =>
      el?.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 550 * t, delay: delay * t, easing: "ease-out", fill: "forwards" });
    const timers: number[] = [];

    ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450 * t, fill: "forwards" });
    fade(q(".vip-sp-hd"), 300);
    fade(q(".vip-sp-title"), 650);
    const g = card("gold");
    g.animate([{ opacity: 0, transform: "translate(0, 70px) scale(.6)" }, { opacity: 1, transform: at("gold", true) }],
      { duration: 700 * t, delay: 1200 * t, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "forwards" });
    fade(q('.vip-sp-lab[data-id="gold"]'), 1500);
    (["diamond", "platinum"] as MetalId[]).forEach((id, i) => {
      const delay = 2300 + i * 800;
      card(id).animate([{ opacity: 0, transform: at("gold", false) }, { opacity: 1, transform: at(id, false) }],
        { duration: 650 * t, delay: delay * t, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "forwards" });
      timers.push(window.setTimeout(() => {
        q(".vip-sp-flash")?.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 600 });
        const r = dk.getBoundingClientRect(), o = ov.getBoundingClientRect();
        sparks(ov, r.left - o.left + r.width / 2 + (id === "diamond" ? 80 : -80), r.top - o.top + 80, 18, 110);
        fade(q(`.vip-sp-lab[data-id="${id}"]`), 0);
      }, (delay + 350) * t));
    });
    timers.push(window.setTimeout(() => {
      // анимации вступления держат карты «вперёд» — снимаем их, дальше места задаёт CSS
      dk.querySelectorAll<HTMLElement>(".vip-sp-card").forEach(c => { c.getAnimations().forEach(a => a.cancel()); c.style.opacity = "1"; });
      setReady(true);
    }, 3900 * t));
    fade(q(".vip-sp-hint"), 4100);
    fade(q(".vip-sp-acts"), 4300);
    return () => { timers.forEach(clearTimeout); document.body.style.overflow = prev; };
  }, [show]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const pick = useCallback((id: MetalId) => {
    if (!ready || id === chosen) return;
    setChosen(id);
    const ov = box.current, dk = deck.current;
    if (ov && dk) {
      const r = dk.getBoundingClientRect(), o = ov.getBoundingClientRect();
      sparks(ov, r.left - o.left + r.width / 2, r.top - o.top + 90, 14, 90);
    }
  }, [ready, chosen]);

  if (!show || !vip) return toast ? <div className="t-toast vip-sp-toast" role="status">{toast}</div> : null;

  // Что сейчас стоит во «Внешнем виде»: золото или обычный цвет (бриллианта и платины ещё не было)
  const current = metalOf(readAppearance());
  const NAME_ACC: Record<MetalId, string> = { gold: "золото", diamond: "бриллиант", platinum: "платину" };
  const keep = chosen === current;

  const close = (apply: MetalId | null, msg: string) => {
    try {
      localStorage.setItem(VIP_SURPRISE_KEY, "1");
      if (apply !== "diamond" && apply !== "platinum") localStorage.setItem(VIP_NEW_KEY, "1");
    } catch { /* приватный режим */ }
    if (apply) saveAppearance({ ...readAppearance(), accent: { preset: "custom", custom: METALS[apply].hex } });
    const ov = box.current;
    let closed = false;
    const done = () => { if (closed) return; closed = true; setShow(false); setToast(msg); };
    if (!ov || reducedMotion()) { done(); return; }
    ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" }).onfinish = done;
    // в фоновой вкладке анимации стоят — закрываем и без них
    window.setTimeout(done, 600);
  };
  const go = () => keep
    ? close(null, "Бриллиант и платина ждут во «Внешнем виде»")
    : close(chosen, `${{ gold: "Золото включено", diamond: "Бриллиант включён", platinum: "Платина включена" }[chosen]}. Сменить можно во «Внешнем виде»`);

  return (
    <div ref={box} className={`vip-sp vip-sp-t-${chosen}`} role="dialog" aria-modal="true" aria-label="Два новых оформления">
      <div className="vip-sp-hd">УВЕДОМЛЕНИЕ ОТ АДМИНИСТРАЦИИ</div>
      <div className="vip-sp-title">Кроме золота у вас теперь<br /><em>ещё два оформления</em></div>
      <div ref={deck} className={`vip-sp-deck ${ready ? "vip-sp-ready" : ""}`}>
        {ORDER.map(id => (
          <MiniCard key={id} id={id} vip={vip} on={chosen === id} onPick={pick} />
        ))}
        <span className="vip-sp-flash" />
      </div>
      <div className="vip-sp-labels">
        {ORDER.map(id => (
          <div key={id} data-id={id} className={`vip-sp-lab ${chosen === id ? "vip-sp-lab-on" : ""}`}>
            {METALS[id].name}<small>{LABEL[id]}</small>
          </div>
        ))}
      </div>
      <div className="vip-sp-hint">Нажмите на карту, чтобы примерить</div>
      <div className="vip-sp-acts">
        <button type="button" className="vip-sp-go" onClick={go}>{keep ? "Оставить" : "Выбрать"} {NAME_ACC[chosen]}</button>
        <button type="button" className="vip-sp-later" onClick={() => close(null, "Новые оформления ждут во «Внешнем виде»")}>Посмотрю потом</button>
      </div>
    </div>
  );
}
