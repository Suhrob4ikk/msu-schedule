"use client";

import { useMemo, type CSSProperties } from "react";
import LessonCard from "./LessonCard";
import { Lesson, gapBetween, humanDuration } from "@/lib/api";

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

  // Состояние каждой пары. Пока не смонтировались (nowMinutes = null) — всё
  // «будущее»: так серверный и первый клиентский рендер совпадают.
  const states = useMemo<LessonState[]>(
    () => lessons.map(l => {
      if (!todayIso || !l.lesson_date) return "future";
      if (l.lesson_date < todayIso) return "past";
      if (l.lesson_date > todayIso) return "future";
      if (nowMinutes == null) return "future";
      if (nowMinutes >= toMin(l.pair_time_end)) return "past";
      if (nowMinutes >= toMin(l.pair_time_start)) return "current";
      return "future";
    }),
    [lessons, todayIso, nowMinutes],
  );

  // Перед какой парой встанет маркер «сейчас».
  // Только между парами: про «день ещё не начался» и «на сегодня всё» и так
  // говорят карточки наверху страницы, дублировать не нужно.
  const nowMarkerAt = useMemo(() => {
    if (!isToday || nowMinutes == null) return -1;
    if (states.includes("current")) return -1; // идёт пара — её точка и так горит
    const idx = lessons.findIndex(l => toMin(l.pair_time_start) > nowMinutes);
    return idx > 0 ? idx : -1;
  }, [isToday, nowMinutes, states, lessons]);

  const nowLabel = nowMinutes == null
    ? ""
    : `${pad(Math.floor(nowMinutes / 60))}:${pad(nowMinutes % 60)}`;

  return (
    <section
      className="mb-5 lg:mb-6 anim-rise"
      style={{ "--d": `${order * 70}ms` } as CSSProperties}
    >
      <h2 className="font-semibold text-sm lg:text-base mb-2.5 lg:mb-3 flex items-center gap-2 flex-wrap">
        {dayLabel}
        {dateLabel && (
          <span className="text-xs lg:text-sm font-normal" style={{ color: "var(--muted)" }}>
            {dateLabel}
          </span>
        )}
        {isToday && (
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
          >
            сегодня
          </span>
        )}
      </h2>

      <div className="tl-rail" data-dim={dimPast ? "1" : undefined}>
        {lessons.map((lesson, i) => {
          // Окно = пропущенный слот пары. Обычный перерыв между соседними
          // парами (включая обед III→IV) окном не считается.
          const gap = i > 0 ? gapBetween(lessons[i - 1].pair_number, lesson.pair_number) : null;
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
                  <span className="block opacity-60">{lesson.pair_time_end}</span>
                </span>
                <span
                  className={`tl-dot${state === "current" ? " now-dot" : ""}`}
                  data-state={state}
                  style={{ top: 19 }}
                  aria-hidden="true"
                />
                <LessonCard
                  lesson={lesson}
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
