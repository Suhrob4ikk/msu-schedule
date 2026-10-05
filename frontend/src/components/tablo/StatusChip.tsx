"use client";
/**
 * Чип связи: «● обновлено 10:20» или «● нет сети · 10:20» (время, на которое
 * актуальны данные). Не нажимается. Статус всегда словами — цвет точки не
 * единственный признак.
 */
import { useNetStatus } from "@/lib/tablo/hooks";
import { dushanbeNow, isoOf } from "@/lib/tablo/schedule";

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function when(ms: number): string {
  const d = dushanbeNow(ms);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return isoOf(d) === isoOf(dushanbeNow()) ? hm : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${hm}`;
}

export default function StatusChip({ compact = false }: { compact?: boolean }) {
  const st = useNetStatus();
  if (!st || (st.online && !st.lastOkAt)) return null;
  const time = st.lastOkAt ? when(st.lastOkAt) : null;
  const offline = !st.online;
  return (
    <span className={`t-status ${offline ? "t-status-off" : ""}`} role="status">
      <span className="t-status-dot" aria-hidden="true" />
      {offline
        ? <span>нет сети{time && !compact ? ` · ${time}` : ""}</span>
        : <span><span className={compact ? "sr-only" : ""}>обновлено </span>{time}</span>}
    </span>
  );
}
