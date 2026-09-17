"use client";

import { useMemo, type CSSProperties } from "react";
import LessonCard from "./LessonCard";
import { Lesson, gapBetween, leadingGap, humanDuration, PAIR_NUMBERS } from "@/lib/api";

/**
 * Один день расписания в виде вертикального таймлайна.
 *
 * Слева «рельса» со временем и точками-станциями: прошедшие пары приглушены,
 * текущая подсвечена пульсирующей точкой, окна разрывают линию пунктиром.
 * Между парами показывается живой маркер текущего времени.
 *
 * Смысл не в красоте: окна и перемены видно глазами, не читая текст.
 */

/** Минуты от начала суток из строки «08:30». */
const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const pad = (n: number) => String(n).padStart(2, "0");

type LessonState = "past" | "current" | "future";

/** Пары считаются одним занятием, если идут подряд без окна и совпадают
 *  по предмету, преподавателю, аудитории и типу — иначе «2 пары» ввело бы
 *  в заблуждение, будто это одно и то же занятие, а не совпадение подряд. */
function sameBlock(a: Lesson, b: Lesson): boolean {
  return a.subject === b.subject
    && (a.teacher?.id ?? null) === (b.teacher?.id ?? null)
    && (a.room?.id ?? null) === (b.room?.id ?? null)
    && a.lesson_type === b.lesson_type
    && PAIR_NUMBERS.indexOf(b.pair_number) - PAIR_NUMBERS.indexOf(a.pair_number) === 1;
}

/** Группирует отсортированный по парам список дня в блоки подряд идущих
 *  одинаковых пар — по одной карточке на блок вместо нескольких подряд. */
function groupConsecutive(lessons: Lesson[]): Lesson[][] {
  const runs: Lesson[][] = [];
  for (const l of lessons) {
    const run = runs[runs.length - 1];
    if (run && sameBlock(run[run.length - 1], l)) run.push(l);
    else runs.push([l]);
  }
  return runs;
}

interface Props {
  /** «Понедельник» */
  dayLabel: string;
  lessons: Lesson[];
  showAttendance?: boolean;
  showNotes?: boolean;
  /** Сегодняшняя дата YYYY-MM-DD. null до монтирования — SSR-безопасно (#418). */
  todayIso: string | null;
  /** Минуты от полуночи. null до монтирования. */
  nowMinutes: number | null;
  /** Приглушать отработанные пары. Включать только для текущей недели —
   *  в архивной прошло всё, и приглушённой стала бы вся страница. */
  dimPast?: boolean;
  /** Позиция дня в списке — задаёт задержку каскадного появления. */
  order?: number;
}

export default function DaySchedule({
  dayLabel, lessons, showAttendance, showNotes, todayIso, nowMinutes, dimPast, order = 0,
}: Props) {
  const dayDate = lessons[0]?.lesson_date ?? null;
  const isToday = todayIso != null && dayDate === todayIso;

  const dateLabel = dayDate
    ? new Date(dayDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    : null;

  // Подряд идущие одинаковые пары — одной карточкой (см. groupConsecutive).
  const runs = useMemo(() => groupConsecutive(lessons), [lessons]);

  // Состояние каждого блока пар. Пока не смонтировались (nowMinutes = null) —
  // всё «будущее»: так серверный и первый клиентский рендер совпадают.
  const states = useMemo<LessonState[]>(
    () => runs.map(run => {
      const first = run[0], last = run[run.length - 1];
      if (!todayIso || !first.lesson_date) return "future";
      if (first.lesson_date < todayIso) return "past";
      if (first.lesson_date > todayIso) return "future";
      if (nowMinutes == null) return "future";
      if (nowMinutes >= toMin(last.pair_time_end)) return "past";
      if (nowMinutes >= toMin(first.pair_time_start)) return "current";
      return "future";
    }),
    [runs, todayIso, nowMinutes],
  );

  // Перед каким блоком встанет маркер «сейчас».
  // Только между парами: про «день ещё не начался» и «на сегодня всё» и так
  // говорят карточки наверху страницы, дублировать не нужно.
  const nowMarkerAt = useMemo(() => {
    if (!isToday || nowMinutes == null) return -1;
    if (states.includes("current")) return -1; // идёт пара — её точка и так горит
    const idx = runs.findIndex(run => toMin(run[0].pair_time_start) > nowMinutes);
    return idx > 0 ? idx : -1;
  }, [isToday, nowMinutes, states, runs]);

  const nowLabel = nowMinutes == null
    ? ""
    : `${pad(Math.floor(nowMinutes / 60))}:${pad(nowMinutes % 60)}`;

  return (
    <section
      id={isToday ? "day-today" : undefined}
      className="mb-5 lg:mb-6 scroll-mt-28 lg:scroll-mt-32 anim-rise"
      style={{ "--d": `${order * 70}ms` } as CSSProperties}
    >
      {/* Липкий заголовок: держится наверху, пока идут пары этого дня — в
          «Всей неделе» иначе легко потерять, какой день сейчас перед глазами. */}
      <h2 className="sticky top-14 lg:top-16 z-10 bg-[var(--background)] pt-1 pb-2.5 lg:pb-3 mb-2 lg:mb-2.5 border-b border-[var(--border)]">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm lg:text-base uppercase tracking-wide">{dayLabel}</span>
          {isToday && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
            >
              сегодня
            </span>
          )}
        </span>
        {dateLabel && (
          <span className="block text-xs lg:text-sm font-normal mt-0.5" style={{ color: "var(--muted)" }}>
            {dateLabel}
          </span>
        )}
      </h2>

      <div className="tl-rail" data-dim={dimPast ? "1" : undefined}>
        {runs.map((run, i) => {
          const lesson = run[0];
          const last = run[run.length - 1];
          // Окно = пропущенный слот пары. Обычный перерыв между соседними
          // парами (включая обед III→IV) окном не считается. У первой пары
          // дня сравнивать не с чем — leadingGap меряет от начала дня (I
          // пара), а не от предыдущего занятия.
          const gap = i > 0
            ? gapBetween(runs[i - 1][runs[i - 1].length - 1].pair_number, lesson.pair_number)
            : leadingGap(lesson.pair_number);
          const state = states[i];

          return (
            <div key={lesson.id}>
              {gap && (
                <div className="relative py-2" aria-label="Окно в расписании">
                  <span className="tl-gap-line" aria-hidden="true" />
                  <span className="text-[11px] lg:text-xs" style={{ color: "var(--muted)" }}>
                    окно {humanDuration(gap.minutes)} · свободн{gap.pairs.length > 1 ? "ы" : "а"}{" "}
                    {gap.pairs.join(", ")} пар{gap.pairs.length > 1 ? "ы" : "а"}
                  </span>
                </div>
              )}

              {nowMarkerAt === i && (
                <div className="tl-now">
                  <span className="tl-now-label">{nowLabel}</span>
                  <span className="tl-now-line" aria-hidden="true" />
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>сейчас</span>
                </div>
              )}

              <div className="tl-row relative" data-state={state}>
                {/* Время — на рельсе, поэтому из карточки его убираем (compactTime) */}
                <span className="tl-time" style={{ top: 19 }} aria-hidden="true">
                  <span
                    className="block font-semibold"
                    style={{ color: state === "current" ? "var(--primary)" : "var(--foreground)" }}
                  >
                    {lesson.pair_time_start}
                  </span>
                  <span className="block opacity-60">{last.pair_time_end}</span>
                </span>
                <span
                  className={`tl-dot${state === "current" ? " now-dot" : ""}`}
                  data-state={state}
                  style={{ top: 19 }}
                  aria-hidden="true"
                />
                <LessonCard
                  lesson={lesson}
                  mergedWith={run.length > 1 ? run.slice(1) : undefined}
                  compactTime
                  links
                  showAttendance={showAttendance}
                  showNotes={showNotes}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
