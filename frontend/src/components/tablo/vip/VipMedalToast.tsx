"use client";
/**
 * Баннер «Новое достижение» на любой вкладке (11 окт 2026: владелец проверил — медаль
 * появлялась в Кабинете молча). Слушает событие `vip-progress`, которое шлёт vipSync
 * после каждой отметки, считает медали так же, как Кабинет, и показывает те, которых
 * ещё нет в VIP_MEDALS_SEEN_KEY, — по одной, с разлётом звёздочек. Нажатие — в Кабинет.
 * В первый раз (ключа ещё нет) старые медали — полученные до сегодня — запоминаются
 * молча, чтобы не высыпать пачку баннеров; сегодняшние показываются.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVip } from "@/lib/tablo/hooks";
import { dushanbeNow } from "@/lib/tablo/schedule";
import { VIP_MEDALS_SEEN_KEY } from "@/lib/special";
import { STREAK_MARKS, buildMedals, computeStreak, todayIso, type Medal, type VipProgressState } from "@/lib/vipProgress";
import { burstStars } from "./effects";
import { MIcon } from "./MedalIcon";

const SHOW_MS = 5500;

export default function VipMedalToast() {
  const vip = useVip();
  const router = useRouter();
  const [queue, setQueue] = useState<Medal[]>([]);
  const [leaving, setLeaving] = useState(false);
  const fx = useRef<HTMLDivElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const cur = queue[0] ?? null;

  useEffect(() => {
    if (!vip) return;
    const on = (e: Event) => {
      const st = (e as CustomEvent<VipProgressState>).detail;
      if (!st) return;
      const today = todayIso(dushanbeNow());
      const got = buildMedals(st, computeStreak(st, today, STREAK_MARKS)).filter(m => m.got);
      let seen: string[] | null = null;
      try { seen = JSON.parse(localStorage.getItem(VIP_MEDALS_SEEN_KEY) ?? "null"); } catch { /* приватный режим */ }
      const known = new Set(seen ?? got.filter(m => m.got!.slice(0, 10) < today).map(m => m.id));
      const fresh = got.filter(m => !known.has(m.id));
      for (const m of got) known.add(m.id);
      try { localStorage.setItem(VIP_MEDALS_SEEN_KEY, JSON.stringify([...known])); } catch { /* приватный режим */ }
      if (fresh.length) setQueue(q => [...q, ...fresh.filter(m => !q.some(x => x.id === m.id))]);
    };
    window.addEventListener("vip-progress", on);
    return () => window.removeEventListener("vip-progress", on);
  }, [vip]);

  const next = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => { setLeaving(false); setQueue(q => q.slice(1)); }, 350);
  }, []);

  // показ: звёздочки из значка, через 5,5 с — следующий
  useEffect(() => {
    if (!cur) return;
    const s = window.setTimeout(() => {
      const b = fx.current, i = icon.current;
      if (!b || !i) return;
      const r = i.getBoundingClientRect();
      burstStars(b, r.left + r.width / 2, r.top + r.height / 2, 18, 90);
    }, 350);
    const t = window.setTimeout(next, SHOW_MS);
    return () => { window.clearTimeout(s); window.clearTimeout(t); };
  }, [cur, next]);

  if (!vip || !cur) return null;
  return (
    <>
      <div ref={fx} className="vip-toast-fx" aria-hidden="true" />
      <button type="button" key={cur.id} className={`vip-toast ${leaving ? "vip-toast-out" : ""}`} role="status"
        onClick={() => { next(); router.push("/profile"); }}>
        <span ref={icon} className="vip-toast-ic"><MIcon name={cur.icon} /></span>
        <span className="vip-toast-tx">
          <small>Новое достижение</small>
          <b>{cur.name}</b>
          <em>{cur.why}</em>
        </span>
      </button>
    </>
  );
}
