"use client";
/**
 * Незаметный счётчик профиля владельца (11 окт 2026) — как VipTracker у «золотого профиля»:
 * раз в день отмечает посещение на сервере (person = "owner") и шлёт события для теорем:
 * early (до 7:30), owl (после 23:00), explorer (все вкладки), pi (15:14), palindrome
 * (12:21 / 21:12), zero (секрет, 0:00). Время сервер проверяет сам. Раз в 30 с смотрит
 * на часы — чтобы «π» засчиталось и при уже открытом сайте. Ничего не рисует.
 * После каждой отметки — событие `owner-progress` (его слушают карта, теоремы и баннер).
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useOwner } from "@/lib/tablo/hooks";
import { dushanbeNow } from "@/lib/tablo/schedule";
import { fetchVipProgress, todayIso, type VipProgressState } from "@/lib/vipProgress";
import { OWNER_FLAGS_KEY, OWNER_PERSON, OWNER_TABS_KEY, OWNER_VISIT_KEY, computeOwner } from "@/lib/ownerProgress";

const TABS = ["/", "/teachers", "/rooms", "/changes", "/profile"];

const readSet = (key: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
};
const writeSet = (key: string, s: Set<string>) => { try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* приватный режим */ } };

let shared: VipProgressState | null = null;
let first: Promise<VipProgressState | null> | null = null;   // один запрос на всех, кто открылся одновременно
let busy = false;

/** Отметка: посещение (раз в день) и события, которых сервер ещё не принял. */
export async function ownerSync(): Promise<void> {
  if (busy) return;
  let device = "";
  try { device = localStorage.getItem("msu_device_id_v2") ?? ""; } catch { return; }
  if (!device) return;
  const now = dushanbeNow();
  const day = todayIso(now);
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const want = new Set<string>();
  if (minutes >= 4 * 60 && minutes < 7 * 60 + 30) want.add("early");
  if (now.getHours() >= 23) want.add("owl");
  if (hm === "15:14") want.add("pi");
  if (hm === "12:21" || hm === "21:12") want.add("palindrome");
  if (minutes <= 1) want.add("zero");
  if (TABS.every(t => readSet(OWNER_TABS_KEY).has(t))) want.add("explorer");
  const sent = readSet(OWNER_FLAGS_KEY);
  const flags = [...want].filter(f => !sent.has(f));
  let lastDay: string | null = null;
  try { lastDay = localStorage.getItem(OWNER_VISIT_KEY); } catch { /* приватный режим */ }
  if (lastDay === day && flags.length === 0) return;
  busy = true;
  try {
    const st = await fetchVipProgress(device, OWNER_PERSON, true, flags);
    if (!st) return;
    try { localStorage.setItem(OWNER_VISIT_KEY, day); } catch { /* приватный режим */ }
    for (const f of flags) if (st.events[f]) sent.add(f);
    writeSet(OWNER_FLAGS_KEY, sent);
    shared = st;
    window.dispatchEvent(new CustomEvent("owner-progress", { detail: st }));
  } finally {
    busy = false;
  }
}

/** Прогресс владельца для карты и теорем: с сервера при открытии, дальше — по событию. */
export function useOwnerProgress() {
  const [st, setSt] = useState<VipProgressState | null>(shared);
  useEffect(() => {
    let device = "";
    try { device = localStorage.getItem("msu_device_id_v2") ?? ""; } catch { /* приватный режим */ }
    if (device && !shared) {
      first ??= fetchVipProgress(device, OWNER_PERSON, false);
      first.then(s => { if (s) { shared ??= s; setSt(shared); } });
    }
    const onUpd = (e: Event) => { shared = (e as CustomEvent<VipProgressState>).detail; setSt(shared); };
    window.addEventListener("owner-progress", onUpd);
    return () => window.removeEventListener("owner-progress", onUpd);
  }, []);
  const today = todayIso(dushanbeNow());
  return useMemo(() => (st ? computeOwner(st, today) : null), [st, today]);
}

export default function OwnerTracker() {
  const owner = useOwner();
  const path = usePathname();

  // вкладки — для «Теоремы о полноте»
  useEffect(() => {
    if (!owner || !path) return;
    const tab = TABS.find(t => (t === "/" ? path === "/" : path.startsWith(t)));
    if (!tab) return;
    const seen = readSet(OWNER_TABS_KEY);
    if (!seen.has(tab)) { seen.add(tab); writeSet(OWNER_TABS_KEY, seen); }
  }, [owner, path]);

  // отметка: при открытии, смене вкладки, возврате на сайт и раз в 30 с (часы для «π» и «Палиндрома»)
  useEffect(() => {
    if (!owner) return;
    void ownerSync();
    const onVis = () => { if (!document.hidden) void ownerSync(); };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => { if (!document.hidden) void ownerSync(); }, 30_000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.clearInterval(id); };
  }, [owner, path]);

  return null;
}
