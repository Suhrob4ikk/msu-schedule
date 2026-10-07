"use client";
/**
 * Панель «Когда» (макет auditorii-4): ближайшая пара, неделя, день, пара.
 * Неделя, день и пара выбираются внутри панели, список аудиторий меняется только
 * по кнопке «Показать · чт, III пара» (решение владельца, 7 окт 2026: раньше
 * плитки перестраивались на каждом нажатии, пока выбор ещё не закончен — как в
 * приложении, src/rooms/WhenSheet.tsx). Крестик закрывает без изменений.
 */
import { useState } from "react";
import Icon from "../Icon";
import { PAIR_TIMES } from "@/lib/api";
import { addDays, parseIso } from "@/lib/tablo/schedule";
import { PAIRS, type Slot } from "@/lib/tablo/rooms";

const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export interface WhenWeek { weekStart: string; label: string; enabled: boolean }

export default function WhenPanel({
  slot, isNow, nowLabel, today, weeks, onNow, onApply, onClose,
}: {
  slot: Slot;
  isNow: boolean;
  /** «Ближайшая пара · вт, I» */
  nowLabel: string;
  /** Сегодняшняя дата (Душанбе), YYYY-MM-DD — для обводки дня. */
  today: string;
  weeks: WhenWeek[];
  onNow: () => void;
  onApply: (s: Slot) => void;
  onClose: () => void;
}) {
  // Панель создаётся заново при каждом открытии — черновик стартует с текущего выбора
  const [draft, setDraft] = useState<Slot>(slot);
  const set = (weekStart: string, dayIndex: number, pair: string) =>
    setDraft({ weekStart, dayIndex, pair, date: addDays(weekStart, dayIndex) });
  const pairIdx = PAIRS.indexOf(draft.pair);
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
          <button key={w.weekStart} type="button" role="radio" aria-checked={w.weekStart === draft.weekStart}
            disabled={!w.enabled} onClick={() => set(w.weekStart, draft.dayIndex, draft.pair)}
            className={`t-seg-btn ${w.weekStart === draft.weekStart ? "t-seg-on" : ""} ${w.enabled ? "" : "t-seg-off"}`}>
            {w.label}
          </button>
        ))}
      </div>

      <p className="t-over">День</p>
      <div className="t-when-days" role="radiogroup" aria-label="День">
        {DAY_SHORT.map((d, i) => {
          const iso = addDays(draft.weekStart, i);
          return (
            <button key={d} type="button" role="radio" aria-checked={i === draft.dayIndex}
              className={`t-when-chip ${i === draft.dayIndex ? "t-when-chip-on" : ""} ${iso === today ? "t-when-chip-today" : ""}`}
              onClick={() => set(draft.weekStart, i, draft.pair)}>
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
            className={`t-when-chip ${i === pairIdx ? "t-when-chip-on" : ""}`} onClick={() => set(draft.weekStart, draft.dayIndex, p)}>
            <b>{p}</b>
            <span>{PAIR_TIMES[p][0]}</span>
          </button>
        ))}
      </div>

      <button type="button" className="t-btn-fill t-when-apply" onClick={() => onApply(draft)}>
        Показать · {DAY_SHORT[draft.dayIndex].toLowerCase()}, {draft.pair} пара
      </button>
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
