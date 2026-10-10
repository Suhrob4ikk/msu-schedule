"use client";
/**
 * Общие хуки страниц «Табло». Всё, что зависит от окна браузера, localStorage
 * или текущего времени, до монтирования возвращает null — на сервере этого
 * нет, и первый клиентский рендер должен совпасть с серверным (ошибка #418).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { APPEARANCE_KEY, parseAppearance, DEFAULT_APPEARANCE, type Appearance } from "../appearance";
import { api, getNetStatus, onNetStatus, type Group, type NetStatus } from "../api";
import { dushanbeNow } from "./schedule";
import { readVip, type VipInfo } from "../special";

const noop = () => () => {};

/** Совпадает ли медиазапрос; null — ещё не смонтировано. */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

/** Раскладка вкладки по ширине (ТЗ сайта): телефон, планшет, широкий, очень широкий. */
export type Layout = "phone" | "tablet" | "wide" | "xwide";

export function useLayout(): Layout | null {
  const sm = useMediaQuery("(min-width: 640px)");
  const lg = useMediaQuery("(min-width: 1024px)");
  const xl = useMediaQuery("(min-width: 1280px)");
  if (sm === null || lg === null || xl === null) return null;
  return xl ? "xwide" : lg ? "wide" : sm ? "tablet" : "phone";
}

/**
 * Часы Душанбе. Обновляются раз в intervalMs и сразу при возврате на вкладку
 * (вкладку держат открытой часами, а таймеры в фоне браузер притормаживает).
 */
export function useNow(intervalMs = 30_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(dushanbeNow());
    tick();
    const id = window.setInterval(tick, intervalMs);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
  return now;
}

/** Оформление из localStorage; меняется вместе с applyAppearance. */
export function useAppearance(): Appearance | null {
  const raw = useSyncExternalStore(
    cb => {
      window.addEventListener("appearance-change", cb);
      return () => window.removeEventListener("appearance-change", cb);
    },
    () => {
      try { return localStorage.getItem(APPEARANCE_KEY) ?? ""; } catch { return ""; }
    },
    () => null,
  );
  return useMemo(() => (raw === null ? null : parseAppearance(raw) ?? DEFAULT_APPEARANCE), [raw]);
}

/** Статус связи: онлайн/офлайн и время последнего удачного ответа. */
export function useNetStatus(): NetStatus | null {
  const [st, setSt] = useState<NetStatus | null>(null);
  useEffect(() => {
    const read = () => setSt({ ...getNetStatus() });
    read();
    const off = onNetStatus(read);
    const onOffline = () => setSt(s => ({ ...(s ?? getNetStatus()), online: false }));
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", read);
    return () => {
      off();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", read);
    };
  }, []);
  return st;
}

/** true после монтирования. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Особый пользователь (lib/special.ts) или null; до монтирования — null. */
export function useVip(): VipInfo | null {
  const mounted = useMounted();
  return useMemo(() => (mounted ? readVip() : null), [mounted]);
}

export interface Me {
  name: string;
  groupId: number | null;
  group: Group | null;
}

/** Имя и своя группа из Кабинета (localStorage) — для меню аватара и «К моей группе». */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => {
      let name = "";
      let groupId: number | null = null;
      try {
        name = localStorage.getItem("user_name") ?? "";
        groupId = Number(localStorage.getItem("selected_group_id")) || null;
      } catch { /* приватный режим */ }
      setMe(m => ({ name, groupId, group: m?.group?.id === groupId ? m.group : null }));
      if (groupId) {
        api.getGroups()
          .then(gs => { if (alive) setMe({ name, groupId, group: gs.find(g => g.id === groupId) ?? null }); })
          .catch(() => {});
      }
    };
    read();
    window.addEventListener("storage", read);
    return () => { alive = false; window.removeEventListener("storage", read); };
  }, []);
  return me;
}
