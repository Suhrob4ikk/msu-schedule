"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { BULK_MAX_AGE_MS, warmBulk } from "@/lib/offlineBulk";

/**
 * Скачивает всё расписание для офлайна (lib/offlineBulk.ts): через несколько секунд после открытия, когда сайт уже
 * отрисован, и при возврате на вкладку; не чаще раза в 6 часов. Ничего не рисует.
 */
export default function OfflineWarmup() {
  useEffect(() => {
    const run = () => { if (!document.hidden) void warmBulk(() => api.getBulkSync()); };
    const t = window.setTimeout(run, 5000);
    const iv = window.setInterval(run, BULK_MAX_AGE_MS / 2);
    document.addEventListener("visibilitychange", run);
    return () => { window.clearTimeout(t); window.clearInterval(iv); document.removeEventListener("visibilitychange", run); };
  }, []);
  return null;
}
