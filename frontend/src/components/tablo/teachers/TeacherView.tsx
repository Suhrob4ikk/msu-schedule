"use client";
/**
 * Неделя педагога (макеты «Педагоги», широкий экран; на узком — как в
 * приложении): ФИО, «10 пар на этой неделе · сегодня 2», «Ведёт у» — чипы
 * групп (ведут в их расписание), раскрытая карточка ближайшей пары, затем
 * «Таблица» или «Лента». Вместо преподавателя в строках — группы.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DAYS_ORDER } from "@/lib/api";
import {
  dayTitle, diffDays, isoOf, isPast, parseIso, gapLabel, type Block,
} from "@/lib/tablo/schedule";
import {
  dayEndLabel, tBlockA11y, teacherSummary, weekRange, type GroupRef, type TBlock, type TDay,
} from "@/lib/tablo/teachers";
import { BREAK_MAX_MIN } from "@/lib/api";
import Icon from "../Icon";
import TableView from "../schedule/TableView";
import {
  CompactRow, Countdown, DayBody, DayHeading, dayName, daySub, FocusRoom, TypeBadge,
  type FocusLike, type MetaFn,
} from "../schedule/parts";

const DAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Группы строки вместо преподавателя: «Геология-1 · ХФММ-1». */
export const groupsMeta: MetaFn = b => (b as TBlock).groups?.map(g => g.chip).join(" · ") || null;

/** «ср, 7 окт» */
const shortDate = (iso: string) => {
  const d = parseIso(iso);
  return `${DAY_SHORT[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

export const groupHref = (g: GroupRef, weekStart: string | null) =>
  `/?group=${g.id}${weekStart ? `&week=${weekStart}` : ""}`;

/** Широкая раскрытая карточка: время слева, предмет и группы по центру, аудитория справа. */
function FocusWide({ focus, now, onOpen }: { focus: FocusLike; now: Date; onOpen: (b: Block, el: HTMLElement) => void }) {
  const b = focus.block as TBlock;
  const live = focus.filled;
  const t = now.getTime();
  const progress = live && focus.progressFrom != null && focus.targetAt != null
    ? Math.min(1, Math.max(0, (t - focus.progressFrom) / (focus.targetAt - focus.progressFrom))) : null;
  return (
    <button type="button" data-block={b.key} className={`t-tfocus ${live ? "t-focus-live" : ""}`}
      onClick={e => onOpen(b, e.currentTarget)} aria-label={tBlockA11y(b, live ? "идёт" : undefined)}>
      <span className="t-tfocus-left">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="t-pill">{live && <i className="t-live-dot" aria-hidden="true" />}{focus.pill}</span>
          {focus.targetAt != null && focus.countdownLabel && <Countdown ms={focus.targetAt - t} label={focus.countdownLabel} />}
        </span>
        <span className="t-tfocus-time">
          <span className="t-display">{focus.slot.pair_time_start}</span>
          <span>{shortDate(b.date)} · до {b.end}</span>
        </span>
      </span>
      <span className="t-tfocus-mid">
        <span className="t-tfocus-subj">{b.subject}</span>
        <span className="t-row-meta">
          <TypeBadge type={b.type} onFill={live} />
          {b.groups.length > 0 && <span>{b.groups.map(g => g.chip).join(" · ")}</span>}
        </span>
      </span>
      <FocusRoom name={b.room} />
      {progress != null && <span className="t-progress" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></span>}
    </button>
  );
}

/** Подробности пары педагога (макет 3): время, аудитория, «Группы на паре». */
export function TeacherDetails({ block, focus, now, weekStart, onClose, hint }: {
  block: TBlock;
  focus: FocusLike | null;
  now: Date | null;
  weekStart: string | null;
  onClose: () => void;
  hint: string | null;
}) {
  const live = !!focus?.filled && focus.block.key === block.key;
  const t = now?.getTime() ?? 0;
  const rel = now ? diffDays(isoOf(now), block.date) : null;
  const relWord = rel === 0 ? "сегодня" : rel === 1 ? "завтра" : rel === 2 ? "послезавтра" : null;
  const pairsText = block.pairs.length > 1 ? `${block.pairs.join(" и ")} пары` : `${block.pairs[0]} пара`;
  const dayIdx = DAYS_ORDER.indexOf(block.day);
  return (
    <div className="t-panel t-details">
      <div className="flex items-start justify-between gap-2">
        {live && focus ? (
          <span className="t-pill t-pill-soft"><i className="t-live-dot" aria-hidden="true" />{focus.pill}</span>
        ) : <TypeBadge type={block.type} />}
        <button type="button" onClick={onClose} aria-label="Закрыть" className="t-icon-btn -mt-2 -mr-2">
          <Icon name="close" size={22} />
        </button>
      </div>
      <h2 className="t-details-title">{block.subject}</h2>
      {live && focus?.targetAt != null && focus.progressFrom != null && (
        <div className="t-details-live">
          <div className="flex items-end justify-between gap-2">
            <Countdown ms={focus.targetAt - t} label="до конца" />
            <span className="text-[15px] text-[var(--text-2)] tabular-nums">до {block.end}</span>
          </div>
          <span className="t-details-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.max(0, ((t - focus.progressFrom) / (focus.targetAt - focus.progressFrom)) * 100))}%` }} />
          </span>
        </div>
      )}
      <div className="t-details-rows">
        <div className="t-drow">
          <Icon name="clock" size={22} />
          <span>
            <span className="t-drow-cap">{dayTitle(block.date)} · {pairsText}{relWord ? ` · ${relWord}` : ""}</span>
            <span className="t-drow-val tabular-nums">{block.start}–{block.end}</span>
          </span>
        </div>
        {block.room ? (
          <Link href={`/rooms?day=${encodeURIComponent(DAYS_ORDER[dayIdx] ?? "")}&pair=${block.pairs[0]}&room=${encodeURIComponent(block.room)}`}
            className="t-drow t-drow-link">
            <Icon name="pin" size={22} />
            <span><span className="t-drow-cap">Аудитория</span><span className="t-drow-val">{block.room}</span></span>
            <Icon name="chevronRight" size={20} className="t-drow-chev" />
          </Link>
        ) : (
          <div className="t-drow">
            <Icon name="pin" size={22} />
            <span><span className="t-drow-cap">Аудитория</span><span className="t-drow-val">не указана</span></span>
          </div>
        )}
      </div>
      {block.groups.length > 0 && (
        <div className="t-drow-sep pt-3">
          <p className="t-over px-1.5 pb-1">Группы на паре</p>
          {block.groups.map(g => (
            <Link key={g.id} href={groupHref(g, weekStart)} className="t-drow t-drow-link">
              <Icon name="users" size={22} />
              <span>
                <span className="t-drow-val font-semibold">{g.chip}</span>
                <span className="t-drow-cap">Открыть расписание группы</span>
              </span>
              <Icon name="chevronRight" size={20} className="t-drow-chev" />
            </Link>
          ))}
        </div>
      )}
      {hint && <p className="t-details-hint">{hint}</p>}
    </div>
  );
}

/** «Лента» на широком экране: дни карточками в две колонки, пустой день — бледной строкой. */
function TeacherFeed({ days, now, focus, dimPast, selectedKey, onOpen, twoColumns }: {
  days: TDay[];
  now: Date | null;
  focus: FocusLike | null;
  dimPast: boolean;
  selectedKey: string | null;
  onOpen: (b: Block, el: HTMLElement) => void;
  twoColumns: boolean;
}) {
  const shown = days.filter(d => d.dayIndex < 6 || d.blocks.length);
  const todayIso = now ? isoOf(now) : null;
  return (
    <div className={`t-wcols ${twoColumns ? "t-wcols-2" : ""}`}>
      {shown.map(d => (
        <article key={d.date} className={`t-wday ${d.blocks.length ? "" : "t-wday-empty"}`} aria-label={dayName(d)}>
          <header className={d.date === todayIso ? "t-today" : ""}>
            <h3>{dayName(d)}</h3>
            <span>{daySub(d, now).replace(/^(\d+) ([а-я]{3})[а-я]*/, "$1 $2")}</span>
          </header>
          {d.blocks.map((b, i) => {
            const prev = d.blocks[i - 1];
            const gapMin = prev ? Math.round((b.startAt - prev.endAt) / 60_000) : 0;
            return (
              <div key={b.key}>
                {prev && gapMin > BREAK_MAX_MIN && <div className="t-gap t-gap-c">{gapLabel(prev, b)}</div>}
                <CompactRow block={b} past={dimPast && !!now && isPast(b, now)} next={focus?.block.key === b.key}
                  selected={selectedKey === b.key} onOpen={onOpen} meta={groupsMeta} />
              </div>
            );
          })}
        </article>
      ))}
    </div>
  );
}

export interface WeekChoice { weekStart: string; label: string }

export default function TeacherView({
  name, days, rel, now, focus, weeks, weekStart, onWeek, wide, viewMode, onViewMode, showViewToggle,
  selectedKey, onOpen, onBack, onShare, loading, error, onRetry, empty, onShowNext,
}: {
  name: string;
  days: TDay[] | null;
  rel: "current" | "future" | "past" | null;
  now: Date | null;
  focus: FocusLike | null;
  weeks: WeekChoice[];
  weekStart: string | null;
  onWeek: (ws: string) => void;
  wide: boolean;
  viewMode: "table" | "feed";
  onViewMode: (v: "table" | "feed") => void;
  showViewToggle: boolean;
  selectedKey: string | null;
  onOpen: (b: Block, el: HTMLElement) => void;
  onBack?: () => void;
  onShare: (el: HTMLElement) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  empty: { title: string; text: string | null; nearest: string | null; showNext: boolean } | null;
  onShowNext: () => void;
}) {
  // Крупное имя ушло под прилипшую строку «← Педагоги» (верхняя панель 56–64 +
  // строка ≈ 52 px) — показать имя в ней. Наблюдатель, а не обработчик прокрутки.
  const nameRef = useRef<HTMLHeadingElement>(null);
  const [nameGone, setNameGone] = useState(false);
  useEffect(() => {
    const el = nameRef.current;
    if (!el || !onBack) return;
    const io = new IntersectionObserver(
      ([e]) => setNameGone(!e.isIntersecting && e.boundingClientRect.top < 200),
      { rootMargin: "-120px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onBack]);
  const dimPast = rel === "current";
  const summary = days && now && rel ? teacherSummary(days, rel, now) : null;
  const groups = days
    ? [...new Map(days.flatMap(d => d.blocks).flatMap(b => b.groups).map(g => [g.id, g])).values()]
      .sort((a, b) => a.chip.localeCompare(b.chip, "ru"))
    : [];
  const wi = weeks.findIndex(w => w.weekStart === weekStart);
  const hasPairs = !!days && days.some(d => d.blocks.length);

  const weekNav = (
    <div className="t-weeknav">
      <button type="button" aria-label="Предыдущая неделя" disabled={wi <= 0} onClick={() => wi > 0 && onWeek(weeks[wi - 1].weekStart)}>
        <Icon name="chevronLeft" size={20} />
      </button>
      <span>{weekStart ? weekRange(weekStart) : ""}</span>
      <button type="button" aria-label="Следующая неделя" disabled={wi < 0 || wi >= weeks.length - 1}
        onClick={() => wi >= 0 && wi < weeks.length - 1 && onWeek(weeks[wi + 1].weekStart)}>
        <Icon name="chevronRight" size={20} />
      </button>
    </div>
  );

  const body = (() => {
    if (error && !days) {
      return (
        <div className="t-state">
          <Icon name="wifiOff" size={40} />
          <h2>Нет подключения</h2>
          <button type="button" className="t-btn-fill" onClick={onRetry}>Повторить</button>
        </div>
      );
    }
    if (loading && !days) return <div className="t-skel t-skel-block" role="status" aria-label="Загружаем расписание" />;
    if (!days) return null;
    if (!hasPairs && empty) {
      return (
        <div className="t-card t-tweek-empty">
          <span className="t-tweek-empty-ico"><Icon name="calendar" size={28} /></span>
          <h2>{empty.title}</h2>
          {empty.nearest && <p>{empty.nearest}</p>}
          {empty.text && <p>{empty.text}</p>}
          {empty.showNext && <button type="button" className="t-btn-ghost t-btn-wide" onClick={onShowNext}>Показать следующую неделю</button>}
        </div>
      );
    }
    if (wide) {
      return viewMode === "table" ? (
        <TableView days={days} now={now} focus={focus} dimPast={dimPast} selectedKey={selectedKey} onOpen={onOpen}
          meta={groupsMeta} wideToday={false} />
      ) : (
        <TeacherFeed days={days} now={now} focus={focus} dimPast={dimPast} selectedKey={selectedKey} onOpen={onOpen}
          twoColumns={showViewToggle} />
      );
    }
    // Узкий экран — лента как в приложении, раскрытая карточка в своём дне
    return (
      <div className="t-feed">
        {days.filter(d => d.blocks.length).map(d => (
          <section key={d.date} className="t-day" aria-label={dayName(d)}>
            <DayHeading day={d} now={now} id={`tday-${d.date}`} />
            <DayBody day={d} now={now} focus={focus && focus.block.date === d.date ? focus : null} dimPast={dimPast}
              selectedKey={selectedKey} onOpen={onOpen} doneLine={false} meta={groupsMeta} endLabel={dayEndLabel} />
          </section>
        ))}
      </div>
    );
  })();

  return (
    <div className="t-tview">
      {onBack && (
        // Прилипает под верхней панелью; крупное имя уехало — имя проступает рядом
        // с «Педагоги» (как в приложении, просьба владельца 7 окт 2026)
        <div className="t-tbar">
          <button type="button" className="t-btn-ghost t-tback" onClick={onBack}>
            <Icon name="arrowLeft" size={20} />Педагоги
          </button>
          <span className="t-tbar-name" data-on={nameGone} aria-hidden="true">{name}</span>
        </div>
      )}
      <div className="t-thead">
        <div className="min-w-0">
          <h1 className="t-tname" ref={nameRef}>{name}</h1>
          {summary && (
            <p className="t-tsum">{summary.strong && <b>{summary.strong}</b>}{summary.rest}</p>
          )}
        </div>
        {wide && (
          <div className="t-tactions">
            {weekNav}
            {showViewToggle && (
              <div className="t-seg t-seg-view" role="radiogroup" aria-label="Вид">
                {([["feed", "Лента"], ["table", "Таблица"]] as const).map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={viewMode === v}
                    className={`t-seg-btn ${viewMode === v ? "t-seg-on" : ""}`} onClick={() => onViewMode(v)}>{label}</button>
                ))}
              </div>
            )}
            <button type="button" className="t-share-btn t-share-icon" aria-label="Поделиться" onClick={e => onShare(e.currentTarget)}>
              <Icon name="share" size={20} />
            </button>
          </div>
        )}
      </div>

      {!wide && (
        <div className="flex items-stretch gap-2 mb-1">
          <div className="t-seg t-tweekseg flex-1" role="tablist" aria-label="Неделя">
            {weeks.map(w => (
              <button key={w.weekStart} type="button" role="tab" aria-selected={w.weekStart === weekStart}
                className={`t-seg-btn ${w.weekStart === weekStart ? "t-seg-on" : ""}`} onClick={() => onWeek(w.weekStart)}>
                <b>{w.label}</b>
                <span>{weekRange(w.weekStart)}</span>
              </button>
            ))}
          </div>
          <button type="button" className="t-share-btn t-share-icon" aria-label="Поделиться" onClick={e => onShare(e.currentTarget)}>
            <Icon name="share" size={20} />
          </button>
        </div>
      )}

      {groups.length > 0 && (
        <div className="t-tgroups">
          <span>Ведёт у</span>
          {groups.map(g => (
            <Link key={g.id} href={groupHref(g, weekStart)} className="t-gchip">{g.chip}</Link>
          ))}
        </div>
      )}

      {wide && focus && now && hasPairs && <FocusWide focus={focus} now={now} onOpen={onOpen} />}

      {body}
    </div>
  );
}

