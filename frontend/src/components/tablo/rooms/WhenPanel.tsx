"use client";
/**
 * Панель «Когда» (макет auditorii-4): ближайшая пара, неделя, день, пара.
 * Неделя и день применяются сразу, выбор пары закрывает панель (решение владельца, окт 2026).
 */
import Icon from "../Icon";
import { PAIR_TIMES } from "@/lib/api";
import { addDays, parseIso } from "@/lib/tablo/schedule";
import { PAIRS, type Slot } from "@/lib/tablo/rooms";

const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export interface WhenWeek { weekStart: string; label: string; enabled: boolean }

export default function WhenPanel({
  slot, isNow, nowLabel, today, weeks, onNow, onWeek, onDay, onPair, onClose,
}: {
  slot: Slot;
  isNow: boolean;
  /** «Ближайшая пара · вт, I» */
  nowLabel: string;
  /** Сегодняшняя дата (Душанбе), YYYY-MM-DD — для обводки дня. */
  today: string;
  weeks: WhenWeek[];
  onNow: () => void;
  onWeek: (ws: string) => void;
  onDay: (i: number) => void;
  onPair: (i: number) => void;
  onClose: () => void;
}) {
  const pairIdx = PAIRS.indexOf(slot.pair);
  return (
    <div className="t-when">
      <div className="t-when-head">
        <h2>Когда</h2>
        <button type="button" className="t-icon-btn" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={22} />
        </button>
      </div>

      <button type="button" className={`t-when-now ${isNow ? "t-when-now-on" : ""}`} onClick={onNow} aria-pressed={isNow}>
        {nowLabel}
      </button>

      <p className="t-over">Неделя</p>
      <div className="t-seg" role="radiogroup" aria-label="Неделя">
        {weeks.map(w => (
          <button key={w.weekStart} type="button" role="radio" aria-checked={w.weekStart === slot.weekStart}
            disabled={!w.enabled} onClick={() => onWeek(w.weekStart)}
            className={`t-seg-btn ${w.weekStart === slot.weekStart ? "t-seg-on" : ""} ${w.enabled ? "" : "t-seg-off"}`}>
            {w.label}
          </button>
        ))}
      </div>

      <p className="t-over">День</p>
      <div className="t-when-days" role="radiogroup" aria-label="День">
        {DAY_SHORT.map((d, i) => {
          const iso = addDays(slot.weekStart, i);
          return (
            <button key={d} type="button" role="radio" aria-checked={i === slot.dayIndex}
              className={`t-when-chip ${i === slot.dayIndex ? "t-when-chip-on" : ""} ${iso === today ? "t-when-chip-today" : ""}`}
              onClick={() => onDay(i)}>
              <b>{d}</b>
              <span>{parseIso(iso).getDate()}</span>
            </button>
          );
        })}
      </div>

      <p className="t-over">Пара</p>
      <div className="t-when-pairs" role="radiogroup" aria-label="Пара">
        {PAIRS.map((p, i) => (
          <button key={p} type="button" role="radio" aria-checked={i === pairIdx}
            className={`t-when-chip ${i === pairIdx ? "t-when-chip-on" : ""}`} onClick={() => onPair(i)}>
            <b>{p}</b>
            <span>{PAIR_TIMES[p][0]}</span>
          </button>
        ))}
      </div>

      <p className="t-when-hint">
        Сначала день, затем пара: после выбора пары окно закроется
      </p>
    </div>
  );
}

const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** «Эта · 5–10 окт» / «Следующая». */
export function weekLabelFor(weekStart: string, thisMonday: string): string {
  if (weekStart !== thisMonday) return "Следующая";
  const a = parseIso(weekStart);
  const b = parseIso(addDays(weekStart, 5));
  const r = a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MON[b.getMonth()]}`
    : `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`;
  return `Эта · ${r}`;
}
