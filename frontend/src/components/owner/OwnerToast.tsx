"use client";
/**
 * Баннеры профиля владельца на любой вкладке (11 окт 2026): «Доказано ∎ · <теорема>» и
 * «Новый уровень · 6 · Эйлер». Слушает `owner-progress` (OwnerTracker), сравнивает с тем,
 * о чём баннер уже был (OWNER_SEEN_KEY). В первый раз теоремы, доказанные до сегодня, и
 * текущий уровень запоминаются молча. По одному, ~5 с; нажатие — в Кабинет.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOwner } from "@/lib/tablo/hooks";
import { dushanbeNow } from "@/lib/tablo/schedule";
import { todayIso, type VipProgressState } from "@/lib/vipProgress";
import { OWNER_SEEN_KEY, OWNER_TABS_KEY, computeOwner } from "@/lib/ownerProgress";

interface Item { id: string; kind: "thm" | "lvl"; title: string; text: string; badge: string }
interface Seen { thm: string[]; level: number }

export default function OwnerToast() {
  const owner = useOwner();
  const router = useRouter();
  const [queue, setQueue] = useState<Item[]>([]);
  const [leaving, setLeaving] = useState(false);
  const cur = queue[0] ?? null;

  useEffect(() => {
    if (!owner) return;
    const on = (e: Event) => {
      const st = (e as CustomEvent<VipProgressState>).detail;
      if (!st) return;
      const today = todayIso(dushanbeNow());
      let tabs = 0;
      try { tabs = JSON.parse(localStorage.getItem(OWNER_TABS_KEY) ?? "[]").length; } catch { /* приватный режим */ }
      const pg = computeOwner(st, today, tabs);
      const got = pg.theorems.filter(t => t.got);
      let seen: Seen | null = null;
      try { seen = JSON.parse(localStorage.getItem(OWNER_SEEN_KEY) ?? "null"); } catch { /* приватный режим */ }
      const known = new Set(seen?.thm ?? got.filter(t => t.got!.slice(0, 10) < today).map(t => t.id));
      const fresh: Item[] = got.filter(t => !known.has(t.id)).map(t => ({
        id: `t:${t.id}`, kind: "thm", title: t.name, text: t.statement ?? "", badge: "Доказано ∎",
      }));
      if (seen && pg.level.level > seen.level) {
        fresh.push({ id: `l:${pg.level.level}`, kind: "lvl", title: `${pg.level.level} · ${pg.level.name}`, text: "Фрактал на карте приблизился", badge: "Новый уровень" });
      }
      try { localStorage.setItem(OWNER_SEEN_KEY, JSON.stringify({ thm: got.map(t => t.id), level: Math.max(pg.level.level, seen?.level ?? 0) })); } catch { /* приватный режим */ }
      if (fresh.length) setQueue(q => [...q, ...fresh.filter(f => !q.some(x => x.id === f.id))]);
    };
    window.addEventListener("owner-progress", on);
    return () => window.removeEventListener("owner-progress", on);
  }, [owner]);

  const next = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => { setLeaving(false); setQueue(q => q.slice(1)); }, 350);
  }, []);

  useEffect(() => {
    if (!cur) return;
    const t = window.setTimeout(next, 5000);
    return () => window.clearTimeout(t);
  }, [cur, next]);

  if (!owner || !cur) return null;
  return (
    <button type="button" key={cur.id} className={`ow-toast ${leaving ? "ow-toast-out" : ""}`} role="status"
      onClick={() => { next(); router.push("/profile"); }}>
      <span className={`ow-toast-ic ${cur.kind === "lvl" ? "ow-toast-lvl" : ""}`} aria-hidden="true">
        {cur.kind === "lvl" ? cur.title.split(" ")[0] : <i />}
      </span>
      <span className="ow-toast-tx">
        <small>{cur.badge}</small>
        <b>{cur.title}</b>
        {cur.text && <em>{cur.text}</em>}
      </span>
    </button>
  );
}
