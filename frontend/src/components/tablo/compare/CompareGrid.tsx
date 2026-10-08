"use client";
/**
 * Таблица «дни × пары» для «Сравнения»: от 1024 — вся неделя с названиями,
 * уже — компактная матрица цветных квадратов (так на телефоне удобнее,
 * решение владельца окт 2026): дни сверху, пары слева (как широкая таблица, просьба
 * владельца 8 окт 2026); по нажатию на квадрат внизу видно пару.
 * В ячейке широкой таблицы по строке на каждую группу:
 * маркер цвета группы, предмет, аудитория; «нет пары» — пустой маркер;
 * где свободны все — ячейка `--soft` «обе свободны».
 */
import { Fragment, useState } from "react";
import { BREAK_MAX_MIN, PAIR_NUMBERS, PAIR_TIMES, humanDuration } from "@/lib/api";
import { slotKey, type SlotMap, type Window } from "@/lib/tablo/compare";
import { addDays, atMs, diffDays, isoOf, parseIso, toMin } from "@/lib/tablo/schedule";

const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export interface CmpGroup { id: number; label: string; map: SlotMap }

function Cell({ groups, dayIndex, pair, hot, past }: {
  groups: CmpGroup[]; dayIndex: number; pair: string; hot: boolean; past: boolean;
}) {
  const items = groups.map(g => g.map.get(slotKey(dayIndex, pair)) ?? null);
  const free = items.every(i => !i);
  if (free) {
    return (
      <div className={`t-cg-cell t-cg-free ${hot ? "t-cg-hot" : ""} ${past ? "t-cg-past" : ""}`}
        role="img" aria-label={groups.length === 2 ? "обе свободны" : "все свободны"} title={groups.length === 2 ? "Обе свободны" : "Все свободны"} />
    );
  }
  return (
    <div className={`t-cg-cell ${hot ? "t-cg-hot" : ""} ${past ? "t-cg-past" : ""}`}>
      {items.map((it, i) => (
        <div key={groups[i].id} className={`t-cg-line ${it ? "" : "t-cg-none"}`}>
          <i className={`t-cg-mark t-cg-m${i} ${it ? "t-cg-on" : ""}`} aria-hidden="true" />
          <span className="t-cg-subj">{it ? it.subject : "нет пары"}</span>
          {it?.room && <b>{it.room}</b>}
        </div>
      ))}
    </div>
  );
}

export default function CompareGrid({ groups, weekStart, now, activeDays, windows, hotKey, single }: {
  groups: CmpGroup[];
  weekStart: string;
  now: Date | null;
  activeDays: number[];
  windows: Window[];
  /** Подсвеченное окно (нажали чип). */
  hotKey: string | null;
  /** Узкий экран: матрица квадратов вместо широкой таблицы. */
  single: boolean;
}) {
  const [sel, setSel] = useState<{ d: number; p: string } | null>(null);
  const today = now ? isoOf(now) : "";
  const hot = windows.find(w => w.key === hotKey) ?? null;
  const isHot = (d: number, p: string) => !!hot && hot.dayIndex === d && hot.pairs.includes(p);
  const pastCell = (d: number, p: string) => {
    if (!now) return false;
    const date = addDays(weekStart, d);
    return date < today || (date === today && atMs(date, PAIR_TIMES[p][1]) <= now.getTime());
  };
  const dayHead = (d: number) => {
    const iso = addDays(weekStart, d);
    const rel = today ? diffDays(today, iso) : 99;
    return { num: parseIso(iso).getDate(), sub: rel === 0 ? "сегодня" : rel === 1 ? "завтра" : null, today: rel === 0 };
  };

  // Полоса перерыва между парами: после каких пар она идёт
  const breakAfter: Record<string, string> = {};
  PAIR_NUMBERS.forEach((p, i) => {
    if (i === 0) return;
    const prev = PAIR_NUMBERS[i - 1];
    const gap = toMin(PAIR_TIMES[p][0]) - toMin(PAIR_TIMES[prev][1]);
    if (gap > BREAK_MAX_MIN) breakAfter[prev] = `перерыв ${humanDuration(gap)}`;
  });

  const days = [0, 1, 2, 3, 4, 5];

  if (single) {
    const cols = activeDays.length ? activeDays : days;
    const freeCount = cols.reduce((n, d) => n + PAIR_NUMBERS.filter(p => groups.every(g => !g.map.has(slotKey(d, p)))).length, 0);
    const state = (d: number, p: string) => {
      const busy = groups.map(g => g.map.has(slotKey(d, p)));
      if (busy.every(b => !b)) return "free";
      if (groups.length === 2) return busy[0] && busy[1] ? "both" : busy[0] ? "mine" : "other";
      return "busy";
    };
    const word: Record<string, string> = { free: "все свободны", both: "заняты обе", mine: "занята первая", other: "занята вторая", busy: "есть пары" };
    return (
      <div className="t-cm">
        <p className="t-cm-count"><strong>{freeCount}</strong> {freeCount === 1 ? "общая свободная пара" : "общих свободных пар"}</p>
        <div className="t-cm-grid" style={{ gridTemplateColumns: `44px repeat(${cols.length}, minmax(0, 1fr))` }}>
          <span />
          {cols.map(d => (
            <div key={d} className={`t-cm-head ${dayHead(d).today ? "t-cm-today" : ""}`}>
              <b>{DAY_SHORT[d]}</b><span>{dayHead(d).num}</span>
            </div>
          ))}
          {PAIR_NUMBERS.map(p => (
            <Fragment key={p}>
              <div className="t-cm-head t-cm-pair"><b>{p}</b><span>{PAIR_TIMES[p][0]}</span></div>
              {cols.map(d => {
                const st = state(d, p);
                const on = sel?.d === d && sel.p === p;
                return (
                  <button key={d} type="button" aria-pressed={on}
                    aria-label={`${DAY_SHORT[d]}, ${p} пара: ${word[st]}`}
                    className={`t-cm-sq t-cm-${st} ${isHot(d, p) ? "t-cg-hot" : ""} ${on ? "t-cm-on" : ""} ${pastCell(d, p) && dayHead(d).today ? "t-cg-past" : ""}`}
                    onClick={() => setSel(on ? null : { d, p })}>
                    {st === "busy" && groups.map((g, i) => (
                      <i key={g.id} className={`t-cg-mark t-cg-m${i} ${g.map.has(slotKey(d, p)) ? "t-cg-on" : ""}`} />
                    ))}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
        {sel && (
          <div className="t-cm-detail">
            <p>{DAY_SHORT[sel.d]} {dayHead(sel.d).num} · {sel.p} пара · {PAIR_TIMES[sel.p][0]}–{PAIR_TIMES[sel.p][1]}</p>
            <Cell groups={groups} dayIndex={sel.d} pair={sel.p} hot={false} past={false} />
          </div>
        )}
        <div className="t-cm-legend">
          <span><i className="t-cm-free" />{groups.length === 2 ? "оба свободны" : "все свободны"}</span>
          {groups.length === 2 ? (
            <>
              <span><i className="t-cm-mine" />занята {groups[0].label}</span>
              <span><i className="t-cm-other" />занята {groups[1].label}</span>
              <span><i className="t-cm-both" />заняты обе</span>
            </>
          ) : <span><i className="t-cm-busy" />есть пары (точки — у кого)</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="t-cg" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }} role="table" aria-label="Расписание групп">
      <div />
      {days.map(d => {
        const h = dayHead(d);
        return (
          <div key={d} className={`t-cg-head ${h.today ? "t-cg-today" : ""}`}>
            <b>{DAY_SHORT[d]} {h.num}</b>
            {h.sub && <span>{h.sub}</span>}
          </div>
        );
      })}
      {PAIR_NUMBERS.map(p => (
        <Fragment key={p}>
          <div className="t-cg-pair"><b>{p}</b><span>{PAIR_TIMES[p][0]}</span></div>
          {days.map(d => (
            <div key={d} className={dayHead(d).today ? "t-cg-today" : ""}>
              <Cell groups={groups} dayIndex={d} pair={p} hot={isHot(d, p)} past={dayHead(d).today && pastCell(d, p)} />
            </div>
          ))}
          {breakAfter[p] && <div className="t-cg-break"><span>{breakAfter[p]}</span></div>}
        </Fragment>
      ))}
    </div>
  );
}
