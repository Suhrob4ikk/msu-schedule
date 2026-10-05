"use client";
/**
 * Вид «Таблица · сегодня шире» (ТЗ сайта, раздел 2б/2в) — только от 1280 px.
 * Колонки — дни, строки — пары (только те, что есть в неделе). Сегодняшний
 * столбец в 2,1 раза шире и подсвечен; в нём время со статусом («прошла»,
 * «через 1 ч 10 мин»), идущая пара залита. Между парами с перерывом больше
 * 20 минут — полоса «перерыв 1 ч · 13:00–14:00». Стрелки двигают фокус по
 * ячейкам, Enter открывает подробности. Заголовки дней — просто подписи
 * (по ТЗ клик переключал в «Ленту», владелец решил убрать, окт 2026).
 */
import { useMemo } from "react";
import { PAIR_NUMBERS, PAIR_TIMES, humanDuration, BREAK_MAX_MIN } from "@/lib/api";
import {
  blockA11y, isoOf, isPast, pairsLabel, toMin, type Block, type DayData, type Focus,
} from "@/lib/tablo/schedule";
import { Countdown, daySub, kindTone, leftText, TypeBadge } from "./parts";

const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAY_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const pad2 = (n: number) => String(n).padStart(2, "0");

interface Cell { block: Block; col: number; rowStart: number; rowEnd: number }

export default function TableView({ days, now, focus, dimPast, selectedKey, onOpen }: {
  days: DayData[];
  now: Date | null;
  focus: Focus | null;
  dimPast: boolean;
  selectedKey: string | null;
  onOpen: (b: Block, el: HTMLElement) => void;
}) {
  const shown = useMemo(() => days.filter(d => d.dayIndex < 6 || d.blocks.length), [days]);
  const todayIso = now ? isoOf(now) : null;

  // Широкий столбец: сегодня (если он в неделе) или день раскрытой пары.
  const wideIdx = useMemo(() => {
    const t = shown.findIndex(d => d.date === todayIso);
    if (t >= 0) return t;
    return focus ? shown.findIndex(d => d.date === focus.block.date) : -1;
  }, [shown, todayIso, focus]);

  // Строки сетки: заголовок, затем пары, которые есть в неделе, и полоса перерыва.
  const layout = useMemo(() => {
    const pairs = PAIR_NUMBERS.filter(p => shown.some(d => d.blocks.some(b => b.pairs.includes(p))));
    const rowOf: Record<string, number> = {};
    const breaks: Array<{ row: number; label: string }> = [];
    let row = 2;
    pairs.forEach((p, i) => {
      if (i > 0) {
        const prev = pairs[i - 1];
        const gap = toMin(PAIR_TIMES[p][0]) - toMin(PAIR_TIMES[prev][1]);
        if (gap > BREAK_MAX_MIN) {
          breaks.push({ row, label: `перерыв ${humanDuration(gap)} · ${PAIR_TIMES[prev][1]}–${PAIR_TIMES[p][0]}` });
          row++;
        }
      }
      rowOf[p] = row++;
    });
    const template = ["auto", ...Array.from({ length: row - 2 }, (_, i) =>
      breaks.some(b => b.row === i + 2) ? "28px" : "minmax(118px, auto)")].join(" ");
    const cells: Cell[] = [];
    shown.forEach((d, ci) => d.blocks.forEach(b => {
      cells.push({ block: b, col: ci, rowStart: rowOf[b.pairs[0]], rowEnd: rowOf[b.pairs[b.pairs.length - 1]] + 1 });
    }));
    return { pairs, rowOf, breaks, template, cells, lastRow: row };
  }, [shown]);

  const columns = ["84px", ...shown.map((_, i) => (i === wideIdx ? "minmax(0, 2.1fr)" : "minmax(0, 1fr)"))].join(" ");

  /** Стрелки: ближайшая ячейка в направлении; панель едет следом. */
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, cell: Cell) => {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    const [dc, dr] = dir;
    let best: Cell | null = null;
    let bestScore = Infinity;
    for (const c of layout.cells) {
      if (c === cell) continue;
      if (dc) {
        const dCol = (c.col - cell.col) * dc;
        if (dCol <= 0) continue;
        const overlap = c.rowStart < cell.rowEnd && c.rowEnd > cell.rowStart;
        const score = dCol * 100 + (overlap ? 0 : 50 + Math.abs(c.rowStart - cell.rowStart));
        if (score < bestScore) { bestScore = score; best = c; }
      } else {
        if (c.col !== cell.col) continue;
        const dRow = dr > 0 ? c.rowStart - cell.rowEnd : cell.rowStart - c.rowEnd;
        if (dRow < 0) continue;
        if (dRow < bestScore) { bestScore = dRow; best = c; }
      }
    }
    if (!best) return;
    const el = document.querySelector<HTMLElement>(`[data-cell="${best.block.key}"]`);
    el?.focus();
    if (el && selectedKey) onOpen(best.block, el);
  };

  const t = now?.getTime() ?? 0;

  return (
    <div className="t-table" style={{ gridTemplateColumns: columns, gridTemplateRows: layout.template }} role="region" aria-label="Расписание на неделю">
      {/* Подсветка сегодняшнего столбца — во всю высоту */}
      {wideIdx >= 0 && shown[wideIdx].date === todayIso && (
        <div className="t-table-today" style={{ gridColumn: wideIdx + 2, gridRow: `1 / ${layout.lastRow}` }} aria-hidden="true" />
      )}

      {/* Заголовки дней */}
      {shown.map((d, i) => {
        const wide = i === wideIdx;
        const isToday = d.date === todayIso;
        const date = new Date(d.date + "T00:00:00");
        const done = isToday && !!now && d.blocks.length > 0 && d.blocks[d.blocks.length - 1].endAt <= t;
        return (
          <div key={d.date} className={`t-th ${wide ? "t-th-wide" : ""} ${isToday ? "t-today" : ""}`}
            style={{ gridColumn: i + 2, gridRow: 1 }} role="heading" aria-level={3}>
            <span className="t-th-name">
              {wide ? `${DAY_FULL[d.dayIndex]}, ${date.getDate()} ${MONTHS_GEN[date.getMonth()]}` : `${DAY_SHORT[d.dayIndex]} ${date.getDate()}`}
            </span>
            <span className="t-th-sub">
              {done && now
                ? `${pad2(now.getHours())}:${pad2(now.getMinutes())} · на сегодня всё`
                : wide ? daySub(d, now, false) : (daySub(d, now, false).split(" · ")[0])}
            </span>
          </div>
        );
      })}

      {/* Столбец пар */}
      {layout.pairs.map(p => {
        const live = focus?.kind === "live" && focus.slot.pair_number === p && focus.block.date === todayIso;
        return (
          <div key={p} className={`t-tpair ${live ? "t-tpair-now" : ""}`} style={{ gridColumn: 1, gridRow: layout.rowOf[p] }}>
            <b>{p}</b>
            <span>{PAIR_TIMES[p][0]}</span>
            <span>{PAIR_TIMES[p][1]}</span>
          </div>
        );
      })}

      {/* Перерывы — подпись на линии во всю ширину */}
      {layout.breaks.map(b => (
        <div key={b.row} className="t-tbreak" style={{ gridColumn: "1 / -1", gridRow: b.row }}>
          <span>{b.label}</span>
        </div>
      ))}

      {/* Пустые дни */}
      {shown.map((d, i) => !d.blocks.length && (
        <div key={`e${d.date}`} className="t-tempty" style={{ gridColumn: i + 2, gridRow: `2 / ${layout.lastRow}` }}>пар нет</div>
      ))}

      {/* Пары */}
      {layout.cells.map(c => {
        const b = c.block;
        const l = b.lessons[0];
        const wide = c.col === wideIdx;
        const past = dimPast && !!now && isPast(b, now);
        const isFocus = focus?.block.key === b.key;
        const live = isFocus && !!focus?.filled;
        const calm = isFocus && !focus?.filled;
        const k = kindTone(l.lesson_type);
        const status = past ? "прошла" : live ? "идёт" : calm && focus?.targetAt ? `через ${leftText(focus.targetAt - t)}` : undefined;
        const cls = ["t-cell", wide ? "t-cell-wide" : "", past ? "t-past" : "", live ? "t-cell-live" : "", calm ? "t-cell-next" : "",
          selectedKey === b.key ? "t-sel" : ""].join(" ");
        return (
          <button
            key={b.key}
            type="button"
            data-cell={b.key}
            data-block={b.key}
            className={cls}
            style={{ gridColumn: c.col + 2, gridRow: `${c.rowStart} / ${c.rowEnd}` }}
            onClick={e => onOpen(b, e.currentTarget)}
            onKeyDown={e => onKey(e, c)}
            aria-label={blockA11y(b, status)}
          >
            {wide ? (
              <>
                {live && focus ? (
                  <span className="t-cell-top">
                    <span className="t-pill"><i className="t-live-dot" aria-hidden="true" />{focus.pill}</span>
                    {focus.targetAt != null && <Countdown ms={focus.targetAt - t} label="до конца" />}
                  </span>
                ) : (
                  <span className="t-cell-top">
                    <span className="t-cell-when">
                      {b.start}–{b.end}
                      {status && ` · ${status}`}
                    </span>
                    <span className={`t-cell-room-xl ${l.room ? "" : "t-none"}`}>{l.room?.name ?? "—"}</span>
                  </span>
                )}
                <span className="t-cell-mid">
                  <span className="t-cell-subj-xl">{l.subject}</span>
                  {live && <span className={`t-cell-room-xl ${l.room ? "" : "t-none"}`}>{l.room?.name ?? "—"}</span>}
                </span>
                <span className="t-row-meta">
                  <TypeBadge type={l.lesson_type} past={past} onFill={live} />
                  {l.teacher && <span>{l.teacher.name}{live ? ` · до ${b.end}` : ""}</span>}
                  {b.lessons.length > 1 && <span>· {pairsLabel(b)}</span>}
                </span>
                {live && focus?.progressFrom != null && focus.targetAt != null && (
                  <span className="t-progress" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.max(0, ((t - focus.progressFrom) / (focus.targetAt - focus.progressFrom)) * 100))}%` }} />
                  </span>
                )}
              </>
            ) : (
              <>
                {calm && focus && <span className="t-cell-pill">{focus.pill}</span>}
                <span className="t-cell-top">
                  <span className={`t-cell-type ${k && !past ? `t-tt-${k.tone}` : ""}`}>{k?.label ?? ""}</span>
                  <span className={`t-cell-room ${l.room ? "" : "t-none"}`}>{l.room?.name ?? "—"}</span>
                </span>
                <span className="t-cell-subj">{l.subject}</span>
                <span className="t-cell-teacher">
                  {live && focus?.targetAt != null ? `идёт · ещё ${leftText(focus.targetAt - t)}` : l.teacher?.name ?? ""}
                </span>
                {b.lessons.length > 1 && <span className="t-cell-double">{pairsLabel(b)} · {b.start}–{b.end}</span>}
                {live && focus?.progressFrom != null && focus.targetAt != null && (
                  <span className="t-progress" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.max(0, ((t - focus.progressFrom) / (focus.targetAt - focus.progressFrom)) * 100))}%` }} />
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
