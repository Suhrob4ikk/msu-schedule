"use client";
/** Мелкие части вкладки: ряд дней, «ещё не вышло», пункты «Поделиться». */
import { isoOf, type DayData } from "@/lib/tablo/schedule";
import Icon, { type IconName } from "../Icon";

const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Ряд дней: выбранный — заливка, сегодня — обводка, точка — есть пары. */
export function DayBar({ days, selected, now, onPick, className = "" }: {
  days: DayData[];
  selected: number | null;
  now: Date | null;
  onPick: (dayIndex: number) => void;
  className?: string;
}) {
  const today = now ? isoOf(now) : null;
  return (
    <div className={`t-daybar ${className}`} role="tablist" aria-label="Дни недели">
      {days.map(d => {
        const on = d.dayIndex === selected;
        const isToday = d.date === today;
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${DAY_SHORT[d.dayIndex]}, ${Number(d.date.slice(8))}${isToday ? ", сегодня" : ""}${d.blocks.length ? "" : ", пар нет"}`}
            className={`t-dcell ${on ? "t-dcell-on" : ""} ${isToday ? "t-dcell-today" : ""}`}
            onClick={() => onPick(d.dayIndex)}
          >
            <span className="t-dcell-wd">{DAY_SHORT[d.dayIndex]}</span>
            <span className="t-dcell-num">{Number(d.date.slice(8))}</span>
            <i className={d.blocks.length ? "t-dcell-dot" : "t-dcell-nodot"} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** Следующая неделя ещё не опубликована (макет 6). */
export function NotPublished({ range, onBack }: { range: string; onBack: () => void }) {
  return (
    <div className="t-notpub">
      <Icon name="calendar" size={44} strokeWidth={1.6} />
      <h2>Расписание на {range} ещё не вышло</h2>
      <p>Обычно выходит в субботу</p>
      <button type="button" className="t-btn-fill" onClick={onBack}>К этой неделе</button>
    </div>
  );
}

export interface ShareAction {
  icon: IconName;
  title: string;
  sub?: string;
  onClick?: () => void;
  href?: string;
  download?: boolean;
}

/** Пункты меню «Поделиться» (макет 7). */
export function ShareList({ items, onDone }: { items: ShareAction[]; onDone: () => void }) {
  return (
    <div className="flex flex-col">
      {items.map((a, i) => {
        const body = (
          <>
            <Icon name={a.icon} size={24} />
            <span className="min-w-0">
              <span className="block text-[16px] font-medium">{a.title}</span>
              {a.sub && <span className="block text-[14px] text-[var(--text-2)]">{a.sub}</span>}
            </span>
          </>
        );
        return a.href ? (
          <a key={i} href={a.href} download={a.download || undefined} className="t-menu-item t-menu-tall" onClick={onDone}>{body}</a>
        ) : (
          <button key={i} type="button" className="t-menu-item t-menu-tall w-full" onClick={() => { onDone(); a.onClick?.(); }}>{body}</button>
        );
      })}
    </div>
  );
}
