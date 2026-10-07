"use client";
/**
 * Части ленты «Табло» — как в приложении (src/schedule/LessonRow, FocusCard,
 * DaySection): строка пары, раскрытая карточка, день с перерывами и линией
 * «на сегодня всё». Цвета — только токены (globals.css, tablo.css).
 */
import { DAYS_ORDER, PAIR_NUMBERS, PAIR_TIMES } from "@/lib/api";
import {
  blockA11y, diffDays, freeFromLabel, gapLabel, isoOf, isPast, leftParts, leftSpoken, lessonKind, pairsLabel,
  parseIso, plural, slotsLabel, type Block, type DayData, type Focus,
} from "@/lib/tablo/schedule";

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Цвет бейджа по типу занятия. */
export function kindTone(type: string | null): { label: string; tone: string } | null {
  const k = lessonKind(type);
  if (!k) return null;
  const tone = k.palette === "lecture" ? "lec" : k.palette === "practice" ? "lab" : k.palette === "exam" ? "exam"
    : k.label === "Поток" ? "flow" : "neutral";
  return { label: k.label, tone };
}

export function TypeBadge({ type, past = false, onFill = false }: { type: string | null; past?: boolean; onFill?: boolean }) {
  const k = kindTone(type);
  if (!k) return null;
  const cls = onFill ? "t-badge-onfill" : past ? "t-badge-past" : `t-tone-${k.tone}`;
  return <span className={`t-badge ${cls}`}>{k.label}</span>;
}

/** «5 октября» */
export const dayDate = (iso: string) => {
  const d = parseIso(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
};

export const pairsCount = (n: number) => `${n} ${plural(n, "пара", "пары", "пар")}`;

/** «5 октября · сегодня · 2 пары», «7 октября · 3 пары · 11:30–17:15», «8 октября · пар нет». */
export function daySub(d: DayData, now: Date | null, withDate = true): string {
  const rel = now ? diffDays(isoOf(now), d.date) : null;
  const word = rel === 0 ? "сегодня" : rel === 1 ? "завтра" : null;
  const parts: string[] = [];
  if (withDate) parts.push(dayDate(d.date));
  if (word) parts.push(word);
  if (!d.blocks.length) parts.push("пар нет");
  else {
    parts.push(pairsCount(d.pairCount));
    if (!word) parts.push(`${d.blocks[0].start}–${d.blocks[d.blocks.length - 1].end}`);
  }
  return parts.join(" · ");
}

export const dayName = (d: DayData) => cap(DAYS_ORDER[d.dayIndex]);

/** Подпись «до конца 1 ч 03 мин» с крупными числами. */
export function Countdown({ ms, label }: { ms: number; label: string }) {
  const p = leftParts(Math.max(0, ms));
  return (
    <span className="t-countdown" aria-label={`${label} ${leftSpoken(ms)}`}>
      {label}{" "}
      {p.lessThanMinute
        ? <b className="t-countdown-small">меньше минуты</b>
        : p.parts.map((x, i) => <span key={i}><b>{x.n}</b> {x.u}{i < p.parts.length - 1 ? " " : ""}</span>)}
    </span>
  );
}

/** «через 1 ч 10 мин» обычным текстом. */
export function leftText(ms: number): string {
  const p = leftParts(Math.max(0, ms));
  return p.lessThanMinute ? "меньше минуты" : p.parts.map(x => `${x.n} ${x.u}`).join(" ");
}

// ─── Строка пары ───────────────────────────────────────────────────────────

/** Что писать рядом с бейджем: в расписании группы — преподаватель, у педагога — группы. */
export type MetaFn = (b: Block) => React.ReactNode;
export const teacherMeta: MetaFn = b => b.lessons[0].teacher?.name ?? null;

/** Раскрытая карточка — общее у расписания группы и педагога. */
export type FocusLike = Pick<Focus, "block" | "slot" | "pill" | "filled" | "targetAt" | "progressFrom"> & {
  countdownLabel: string | null;
};

export interface RowProps {
  block: Block;
  past: boolean;
  selected: boolean;
  onOpen: (b: Block, el: HTMLElement) => void;
  meta?: MetaFn;
}

/** Строка ленты: время 62 px · предмет · аудитория. */
export function LessonRow({ block, past, selected, onOpen, meta = teacherMeta }: RowProps) {
  const l = block.lessons[0];
  const slots = slotsLabel(block);
  return (
    <button
      type="button"
      data-block={block.key}
      className={`t-row ${past ? "t-past" : ""} ${selected ? "t-sel" : ""}`}
      onClick={e => onOpen(block, e.currentTarget)}
      aria-label={blockA11y(block, past ? "прошла" : undefined)}
    >
      <span className="t-row-num" aria-hidden="true">{block.pairs[0]}</span>
      <span className="t-row-time">
        <b>{block.start}</b>
        <span>{block.end}</span>
      </span>
      <span className="t-row-main">
        <span className="t-row-subj">{l.subject}</span>
        <span className="t-row-meta">
          <TypeBadge type={l.lesson_type} past={past} />
          {meta(block) && <span>{meta(block)}</span>}
        </span>
        {slots && <span className="t-row-slots">{slots}</span>}
      </span>
      <span className={`t-row-room ${l.room ? "" : "t-none"}`}>{l.room?.name ?? "—"}</span>
    </button>
  );
}

/** Компактная строка недели на широком экране: 16/700 + «до 11:15», аудитория 19/800. */
export function CompactRow({ block, past, selected, onOpen, next, meta = teacherMeta }: RowProps & { next: boolean }) {
  const l = block.lessons[0];
  return (
    <button
      type="button"
      data-block={block.key}
      className={`t-crow ${past ? "t-past" : ""} ${selected ? "t-sel" : ""} ${next ? "t-next" : ""}`}
      onClick={e => onOpen(block, e.currentTarget)}
      aria-label={blockA11y(block, past ? "прошла" : next ? "следующая" : undefined)}
    >
      <span className="t-crow-time">
        <b>{block.start}</b>
        <span>до {block.end}</span>
      </span>
      <span className="t-row-main">
        <span className="t-crow-subj">{l.subject}</span>
        <span className="t-row-meta">
          <TypeBadge type={l.lesson_type} past={past} />
          {meta(block) && <span>{meta(block)}</span>}
          {block.lessons.length > 1 && <span>· {pairsLabel(block)}</span>}
        </span>
      </span>
      <span className={`t-crow-room ${l.room ? "" : "t-none"}`}>{l.room?.name ?? "—"}</span>
    </button>
  );
}

// ─── Раскрытая карточка ────────────────────────────────────────────────────

export function FocusCard({ focus, now, selected, onOpen, meta = teacherMeta }: {
  focus: FocusLike;
  meta?: MetaFn;
  now: Date;
  selected: boolean;
  onOpen: (b: Block, el: HTMLElement) => void;
}) {
  const l = focus.slot;
  const live = focus.filled;
  const t = now.getTime();
  const progress = live && focus.progressFrom != null && focus.targetAt != null
    ? Math.min(1, Math.max(0, (t - focus.progressFrom) / (focus.targetAt - focus.progressFrom)))
    : null;
  const status = live ? "идёт" : focus.targetAt ? `через ${leftText(focus.targetAt - t)}` : undefined;
  return (
    <button
      type="button"
      data-block={focus.block.key}
      className={`t-focus ${live ? "t-focus-live" : ""} ${selected ? "t-sel" : ""}`}
      onClick={e => onOpen(focus.block, e.currentTarget)}
      aria-label={blockA11y(focus.block, status)}
    >
      <span className="t-focus-top">
        <span className="t-pill">{live && <i className="t-live-dot" aria-hidden="true" />}{focus.pill}</span>
        {focus.targetAt != null && focus.countdownLabel && (
          <Countdown ms={focus.targetAt - t} label={focus.countdownLabel} />
        )}
      </span>
      {/* Несколько аудиторий: первая — на уровне времени, остальные спускаются на
          пустое место рядом с предметом (t-focus-multi, владелец 7 окт 2026) */}
      <span className="t-focus-body">
      <span className={roomCount(l.room?.name) > 1 ? "t-focus-multi" : "t-focus-single"}>
        <span className="t-focus-mid">
          <span>
            <span className="t-display">{l.pair_time_start}</span>
            <span className="t-focus-until">до {focus.block.lessons.length > 1 ? focus.block.end : l.pair_time_end}</span>
          </span>
          {roomCount(l.room?.name) <= 1 && <FocusRoom name={l.room?.name} />}
        </span>
        <span className="t-focus-subj">{l.subject}</span>
        <span className="t-row-meta">
          <TypeBadge type={l.lesson_type} onFill={live} />
          {meta(focus.block) && <span>{meta(focus.block)}</span>}
        </span>
        {slotsLabel(focus.block) && <span className="t-row-slots">{slotsLabel(focus.block)}</span>}
      </span>
      {roomCount(l.room?.name) > 1 && <FocusRoom name={l.room?.name} />}
      </span>
      {progress != null && (
        <span className="t-progress" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></span>
      )}
    </button>
  );
}

/** «11:56 · на сегодня всё» — точка, подпись и линия до края, цветом --ink. */
export function NowLine({ now }: { now: Date }) {
  return (
    <div className="t-nowline" role="note">
      <i aria-hidden="true" />
      <span>{pad2(now.getHours())}:{pad2(now.getMinutes())} · на сегодня всё</span>
      <em aria-hidden="true" />
    </div>
  );
}

// ─── День ──────────────────────────────────────────────────────────────────

export interface DayProps {
  day: DayData;
  now: Date | null;
  /** Раскрытая карточка — если она в этом дне. */
  focus: FocusLike | null;
  /** Серым только в текущей неделе. */
  dimPast: boolean;
  selectedKey: string | null;
  onOpen: (b: Block, el: HTMLElement) => void;
  /** Линия «на сегодня всё» после карточки. */
  doneLine: boolean;
  meta?: MetaFn;
  /** Подпись после последней пары: «свободны с 13:00», у педагога — «после 13:00 пар нет». */
  endLabel?: (last: Block) => string;
  /**
   * Пустые пары до первой — бледные строки «I · 08:00–09:30» (проба по просьбе
   * владельца, 7 окт 2026, как в приложении msu.tj). Только расписание группы.
   */
  emptyBefore?: boolean;
}

/**
 * Карточка дня с перерывами внутри: «перемена 15 мин», «перерыв 1 ч», в конце
 * «свободны с 13:00». Раскрытая карточка стоит вместо своей строки, и
 * карточка дня рвётся вокруг неё.
 */
export function DayBody({ day, now, focus, dimPast, selectedKey, onOpen, doneLine, meta, endLabel = freeFromLabel, emptyBefore = false }: DayProps) {
  if (!day.blocks.length) return null;
  const segments: React.ReactNode[] = [];
  let rows: React.ReactNode[] = [];
  const flush = (key: string) => {
    if (rows.length) segments.push(<div key={key} className="t-daycard">{rows}</div>);
    rows = [];
  };
  if (emptyBefore) {
    const first = PAIR_NUMBERS.indexOf(day.blocks[0].pairs[0]);
    PAIR_NUMBERS.slice(0, Math.max(0, first)).forEach(p => rows.push(
      <div key={`e${p}`} className="t-row t-emptypair" aria-label={`${p} пара, ${PAIR_TIMES[p][0]}–${PAIR_TIMES[p][1]}, пары нет`}>
        <span className="t-row-num">{p}</span>
        <span className="t-row-time">
          <b>{PAIR_TIMES[p][0]}</b>
          <span>{PAIR_TIMES[p][1]}</span>
        </span>
      </div>,
    ));
  }
  day.blocks.forEach((b, i) => {
    const prev = day.blocks[i - 1];
    const gap = prev ? gapLabel(prev, b) : null;
    if (gap) rows.push(<div key={`g${i}`} className="t-gap">{gap}</div>);
    if (focus && focus.block.key === b.key && now) {
      flush(`s${i}`);
      segments.push(
        <FocusCard key={`f${i}`} focus={focus} now={now} selected={selectedKey === b.key} onOpen={onOpen} meta={meta} />,
      );
      return;
    }
    rows.push(
      <LessonRow key={b.key} block={b} past={dimPast && !!now && isPast(b, now)} selected={selectedKey === b.key} onOpen={onOpen} meta={meta} />,
    );
  });
  rows.push(<div key="free" className="t-gap">{endLabel(day.blocks[day.blocks.length - 1])}</div>);
  flush("end");
  return (
    <div className="t-daybody">
      {segments}
      {doneLine && now && <NowLine now={now} />}
    </div>
  );
}

/**
 * Аудитория в раскрытой карточке. Несколько («404 401») — одна под другой, а не
 * рядом (просьба владельца, 7 окт 2026), заголовок «Аудитории».
 */
const roomList = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/).filter(Boolean);
const roomCount = (name: string | null | undefined) => roomList(name).length;

export function FocusRoom({ name }: { name: string | null | undefined }) {
  const rooms = roomList(name);
  return (
    <span className="t-focus-room">
      <span className="t-over">{rooms.length > 1 ? "Аудитории" : "Аудитория"}</span>
      {rooms.length
        ? rooms.map(r => <span key={r} className="t-display">{r}</span>)
        : <span className="t-display t-none">—</span>}
    </span>
  );
}

/** Заголовок дня по центру: «Среда» 32/800 и «7 октября · 3 пары · 11:30–17:15». */
export function DayHeading({ day, now, id }: { day: DayData; now: Date | null; id?: string }) {
  const today = !!now && isoOf(now) === day.date;
  return (
    <h2 id={id} className={`t-dayhead ${today ? "t-today" : ""}`}>
      <span className="t-dayhead-name">{dayName(day)}</span>
      <span className="t-dayhead-sub">{daySub(day, now)}</span>
    </h2>
  );
}
