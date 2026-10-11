"use client";
/**
 * Незаметный счётчик «золотого профиля» (11 окт 2026): раз в день отмечает посещение
 * на сервере (серия) и отправляет новые события — «Ранняя пташка» (до 7:30),
 * «Ночная сова» (после 23:00), «Исследователь» (все вкладки), «Коллекционер» (все три
 * металла). Секрет отправляет пасхалка (vipFlag). Сервер ранние/поздние часы проверяет сам.
 * Ничего не рисует. Только у особых (lib/special.ts).
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppearance, useVip } from "@/lib/tablo/hooks";
import { dushanbeNow } from "@/lib/tablo/schedule";
import { fetchVipProgress, todayIso } from "@/lib/vipProgress";
import { VIP_FLAGS_KEY, VIP_METALS_KEY, VIP_TABS_KEY, VIP_VISIT_KEY, metalOf, type VipInfo } from "@/lib/special";

const TABS = ["/", "/teachers", "/rooms", "/changes", "/profile"];

const readSet = (key: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
};
const writeSet = (key: string, s: Set<string>) => { try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* приватный режим */ } };

/** Отправить отметку: посещение (раз в день) и события, которых сервер ещё не знает. */
export async function vipSync(vip: VipInfo, extra: string[] = []): Promise<void> {
  let device = "";
  try { device = localStorage.getItem("msu_device_id_v2") ?? ""; } catch { return; }
  if (!device) return;
  const now = dushanbeNow();
  const day = todayIso(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const sent = readSet(VIP_FLAGS_KEY);
  const want = new Set(extra);
  if (minutes >= 4 * 60 && minutes < 7 * 60 + 30) want.add("early");
  if (now.getHours() >= 23) want.add("owl");
  if (TABS.every(t => readSet(VIP_TABS_KEY).has(t))) want.add("explorer");
  if (readSet(VIP_METALS_KEY).size >= 3) want.add("collector");
  const flags = [...want].filter(f => !sent.has(f));
  let lastDay: string | null = null;
  try { lastDay = localStorage.getItem(VIP_VISIT_KEY); } catch { /* приватный режим */ }
  if (lastDay === day && flags.length === 0) return;
  const st = await fetchVipProgress(device, vip.id, true, flags);
  if (!st) return;
  try { localStorage.setItem(VIP_VISIT_KEY, day); } catch { /* приватный режим */ }
  // помечаем отправленными только те, что сервер принял
  for (const f of flags) if (st.events[f]) sent.add(f);
  writeSet(VIP_FLAGS_KEY, sent);
  window.dispatchEvent(new CustomEvent("vip-progress", { detail: st }));
}

export default function VipTracker() {
  const vip = useVip();
  const path = usePathname();
  const appearance = useAppearance();
  const metal = metalOf(appearance);

  // вкладки — для «Исследователя»
  useEffect(() => {
    if (!vip || !path) return;
    const tab = TABS.find(t => (t === "/" ? path === "/" : path.startsWith(t)));
    if (!tab) return;
    const seen = readSet(VIP_TABS_KEY);
    if (!seen.has(tab)) { seen.add(tab); writeSet(VIP_TABS_KEY, seen); }
  }, [vip, path]);

  // примеренные металлы — для «Коллекционера»
  useEffect(() => {
    if (!vip || !metal) return;
    const tried = readSet(VIP_METALS_KEY);
    if (!tried.has(metal)) { tried.add(metal); writeSet(VIP_METALS_KEY, tried); }
  }, [vip, metal]);

  // отметка: при открытии, при смене вкладки и при возврате на сайт
  useEffect(() => {
    if (!vip) return;
    void vipSync(vip);
    const onVis = () => { if (!document.hidden) void vipSync(vip); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [vip, path, metal]);

  return null;
}
