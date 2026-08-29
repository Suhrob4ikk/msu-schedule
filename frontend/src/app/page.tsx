"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import WeekBar from "@/components/WeekBar";
import DaySchedule from "@/components/DaySchedule";
import { ScheduleSkeleton } from "@/components/Skeletons";
import { api, Group, Lesson, TodayItem, Stats, WeekInfo, DAYS_ORDER, breakLabel, shortGroupName } from "@/lib/api";
import { shareScheduleImage } from "@/lib/shareImage";
import { useSwipe } from "@/lib/useSwipe";
import { featuresUnlocked } from "@/lib/features";
import { todayIso } from "@/lib/studyData";
import GroupSelector from "@/components/GroupSelector";
import FeatureHint from "@/components/FeatureHint";
import CourseCheckBanner from "@/components/CourseCheckBanner";
import RadialProgress from "@/components/RadialProgress";

const DAY_LABELS: Record<string, string> = {
  понедельник: "Понедельник", вторник: "Вторник", среда: "Среда",
  четверг: "Четверг", пятница: "Пятница", суббота: "Суббота", воскресенье: "Воскресенье",
};

const DAY_IN: Record<string, string> = {
  понедельник: "В понедельник", вторник: "Во вторник", среда: "В среду",
  четверг: "В четверг", пятница: "В пятницу", суббота: "В субботу", воскресенье: "В воскресенье",
};

const DAY_SHORT: Record<string, string> = {
  понедельник: "Пн", вторник: "Вт", среда: "Ср",
  четверг: "Чт", пятница: "Пт", суббота: "Сб", воскресенье: "Вс",
};

// Короткая метка недели для шапки картинки-шаринга («1 – 7 сентября»)
function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${start.getDate()} – ${end.getDate()} ${months[end.getMonth()]}`;
}

export default function HomePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  // Посещаемость/заметки: откроются автоматически 1 сентября 2026 (см. lib/features.ts).
  // Флаги читаем после монтирования — SSR-безопасно (иначе hydration #418).
  const [featureAttendance, setFeatureAttendance] = useState(false);
  const [featureNotes, setFeatureNotes] = useState(false);
  // Июль–август = каникулы. Вычисляем после монтирования (SSR-безопасно, иначе #418)
  const [isVacation, setIsVacation] = useState(false);
  useEffect(() => {
    setIsVacation([6, 7].includes(new Date().getMonth()));
    if (!featuresUnlocked()) return;
    setFeatureAttendance(localStorage.getItem("feature_attendance") === "1");
    setFeatureNotes(localStorage.getItem("feature_notes") === "1");
  }, []);
  // Значения, зависящие от localStorage / текущей даты, инициализируем
  // серверно-нейтрально (null / "all") и заполняем уже после монтирования —
  // иначе первый клиентский рендер расходится с SSR (React hydration error #418).
  const [profileGroupId, setProfileGroupId] = useState<number | null>(null);
  const [profileGroup, setProfileGroup] = useState<Group | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>("all");

  // После монтирования выставляем день недели по локальному времени пользователя.
  useEffect(() => {
    const jsDay = new Date().getDay(); // 0=вс, 1=пн, ..., 6=сб
    if (jsDay !== 0) setSelectedDay(DAYS_ORDER[(jsDay + 6) % 7]); // пн-сб → русское название
  }, []);

  // Текущая дата и время в минутах — для таймлайна (какие пары прошли, где
  // маркер «сейчас»). null до монтирования: на сервере времени пользователя
  // мы не знаем, и рендеры разошлись бы (hydration #418).
  const [today, setToday] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setToday(todayIso());
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    // Раз в полминуты: маркер двигается по минутам, чаще незачем.
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [nowItems, setNowItems] = useState<TodayItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<number | undefined>(undefined);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  const selectedWeekStartRef = useRef(selectedWeekStart);
  useEffect(() => { selectedWeekStartRef.current = selectedWeekStart; }, [selectedWeekStart]);

  const loadGroup = useCallback(async (group: Group, weekId?: number) => {
    setSelectedGroup(group);
    setLoading(true);
    setError(null);
    localStorage.setItem("schedule_view_group_id", String(group.id));

    try {
      // Сначала загружаем список недель, чтобы найти нужный week_id
      const wks = await api.getGroupWeeks(group.id);
      setWeeks(wks);

      let targetWeekId = weekId;
      if (!targetWeekId && selectedWeekStartRef.current) {
        const matchingWeek = wks.find(w => w.week_start === selectedWeekStartRef.current);
        if (matchingWeek) targetWeekId = matchingWeek.id;
      }

      if (!targetWeekId) {
        // Ищем неделю, содержащую сегодняшнюю дату
        const today = new Date().toISOString().slice(0, 10);
        const currentWeek = wks.find(w => {
          const end = new Date(w.week_start);
          end.setDate(end.getDate() + 6);
          return today >= w.week_start && today <= end.toISOString().slice(0, 10);
        });
        // Если сегодня нет в ни одной неделе — берём is_latest
        targetWeekId = currentWeek?.id ?? wks.find(w => w.is_latest)?.id;
      }

      const [sched, now, st] = await Promise.all([
        api.getGroupSchedule(group.id, undefined, targetWeekId),
        api.getNow(group.id),
        api.getStats(group.id),
      ]);

      const activeWeek = wks.find(w => w.id === targetWeekId) ?? wks.find(w => w.is_latest);
      setSelectedWeekId(activeWeek?.id);
      if (activeWeek) setSelectedWeekStart(activeWeek.week_start);
      setLessons(sched);
      setNowItems(now);
      setStats(st);
    } catch {
      setError("Ошибка загрузки расписания");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInitialGroups = useCallback(() => {
    const savedGroup = localStorage.getItem("selected_group_id");
    const viewedGroup = localStorage.getItem("schedule_view_group_id");
    const deviceId = localStorage.getItem("msu_device_id_v2");

    if (!savedGroup || !deviceId) {
      router.push("/profile");
      return;
    }

    setError(null);
    const profileId = Number(savedGroup);
    setProfileGroupId(profileId);
    api.getGroups()
      .then(gs => {
        setGroups(gs);
        const profile = gs.find(x => x.id === profileId) ?? null;
        setProfileGroup(profile);

        const initialGroupId = Number(viewedGroup ?? savedGroup);
        const g = gs.find(x => x.id === initialGroupId);
        if (g) loadGroup(g);
      })
      .catch(() => setError("Нет соединения с сервером"));
  }, [router, loadGroup]);

  useEffect(() => { loadInitialGroups(); }, [loadInitialGroups]);

  const restoreProfileGroup = useCallback(() => {
    if (profileGroup) {
      loadGroup(profileGroup);
      return;
    }

    if (profileGroupId === null) return;
    const fallback = groups.find(x => x.id === profileGroupId);
    if (fallback) loadGroup(fallback);
  }, [groups, profileGroup, profileGroupId, loadGroup]);

  // Обработчик переключения недели из WeekBar
  const handleWeekChange = useCallback((weekStart: string) => {
    setSelectedWeekStart(weekStart);
    if (!selectedGroup) return;
    const week = weeks.find(w => w.week_start === weekStart);
    if (week) loadGroup(selectedGroup, week.id);
  }, [selectedGroup, weeks, loadGroup]);

  // Воскресенье показываем только если в этой неделе есть пары в этот день
  const hasSunday = useMemo(() => lessons.some(l => l.day_of_week === 'воскресенье'), [lessons]);

  const visibleDays = useMemo(
    () => DAYS_ORDER.filter(d => d !== 'воскресенье' || hasSunday),
    [hasSunday]
  );

  // Отметки и заметки — только на расписании СВОЕЙ группы (на чужих не нужны)
  const isMyGroup = selectedGroup != null && profileGroupId != null && selectedGroup.id === profileGroupId;

  // Идёт ли просматриваемая неделя прямо сейчас. Нужно таймлайну: приглушать
  // отработанные пары осмысленно только в текущей неделе.
  const isCurrentWeek = useMemo(() => {
    if (!today || !selectedWeekStart) return false;
    const end = new Date(selectedWeekStart);
    end.setDate(end.getDate() + 6);
    const p = (n: number) => String(n).padStart(2, "0");
    const endIso = `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`;
    return today >= selectedWeekStart && today <= endIso;
  }, [today, selectedWeekStart]);

  const lessonsByDay = useMemo(() => {
    const filtered = selectedDay === "all"
      ? lessons
      : lessons.filter(l => l.day_of_week === selectedDay);

    return visibleDays.reduce((acc, day) => {
      const dayLessons = filtered.filter(l => l.day_of_week === day);
      if (dayLessons.length > 0) acc[day] = dayLessons;
      return acc;
    }, {} as Record<string, Lesson[]>);
  }, [lessons, selectedDay, visibleDays]);

  // Свайп по расписанию листает дни: «вся неделя» → пн → вт → …
  // Направление запоминаем, чтобы новый день выезжал с той стороны, куда тянули.
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const dayOrder = useMemo(() => ["all", ...visibleDays], [visibleDays]);
  const shiftDay = useCallback((step: 1 | -1) => {
    const i = dayOrder.indexOf(selectedDay);
    const next = dayOrder[i + step];
    if (i < 0 || !next) return;   // край списка — дальше листать некуда
    setSlideDir(step === 1 ? "left" : "right");
    setSelectedDay(next);
  }, [dayOrder, selectedDay]);
  const swipe = useSwipe(() => shiftDay(1), () => shiftDay(-1));

  // Автопрокрутка к сегодняшнему дню при открытии «Вся неделя» — иначе
  // приходится скроллить руками, если сегодня не понедельник. id и
  // scroll-margin для секции — в DaySchedule.tsx.
  useEffect(() => {
    if (selectedDay !== "all" || loading) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById("day-today")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [selectedDay, loading]);

  const [sharing, setSharing] = useState(false);
  const handleShareImage = useCallback(async () => {
    if (!selectedGroup || sharing) return;
    setSharing(true);
    try {
      const result = await shareScheduleImage({
        groupLabel: `${shortGroupName(selectedGroup.name)} · ${selectedGroup.year} курс`,
        weekLabel: selectedWeekStart ? weekRangeLabel(selectedWeekStart) : "",
        lessonsByDay,
        dayLabels: DAY_LABELS,
      });
      if (result === "empty") alert("Нет пар, чтобы поделиться — выберите день или неделю с занятиями.");
      if (result === "error") alert("Не получилось создать картинку. Попробуйте ещё раз.");
    } finally {
      setSharing(false);
    }
  }, [selectedGroup, selectedWeekStart, lessonsByDay, sharing]);

  const currentItem = nowItems.find(i => i.is_current);
  const nextItem = nowItems.find(i => i.is_next);
  // На сегодня всё — бэкенд прислал первую пару следующего учебного дня
  const tomorrowItem = nowItems.find(i => i.is_tomorrow);

  // Компактная плашка «Идёт сейчас» при скролле: следим за исходной
  // карточкой через IntersectionObserver, а не за scrollY — не завязано на
  // конкретные пиксельные пороги и не дёргает layout на каждый кадр скролла.
  const nowCardRef = useRef<HTMLDivElement>(null);
  const [showCompactNow, setShowCompactNow] = useState(false);
  useEffect(() => {
    if (!currentItem) { setShowCompactNow(false); return; }
    const el = nowCardRef.current;
    if (!el) return;
    // Отрицательный верхний отступ — карточка считается «скрытой» чуть
    // раньше, чем реально уйдёт под sticky-шапку (её высота — h-14/h-16).
    const observer = new IntersectionObserver(
      ([entry]) => setShowCompactNow(!entry.isIntersecting),
      { rootMargin: "-110px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [currentItem]);

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    // Таймер нужен только для обратного отсчёта и прогресса идущей пары.
    // Без них он молотил бы вхолостую, перерисовывая всю страницу раз в секунду.
    if (!currentItem && !nextItem) return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [currentItem, nextItem]);

  // Управление уведомлениями вынесено в одно место — «Мой кабинет» (профиль),
  // чтобы не дублировать кнопку на главной.

  const countdown = useMemo(() => {
    if (!nextItem) return "";

    const [h, m] = nextItem.pair_time_start.split(":").map(Number);
    const target = new Date(currentTime);
    target.setHours(h, m, 0, 0);

    const diffMs = target.getTime() - currentTime;
    if (diffMs <= 0) return "";

    const totalMin = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;

    return hrs > 0 ? `${hrs}ч ${mins}м` : `${mins}:${String(secs).padStart(2, "0")}`;
  }, [currentTime, nextItem]);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Header />

      {/* Компактный дубль «Идёт сейчас» — виден, только пока исходная
          карточка скрыта под шапкой (см. IntersectionObserver выше). */}
      {showCompactNow && currentItem && (() => {
        const [eh, em] = currentItem.pair_time_end.split(":").map(Number);
        const end = new Date(currentTime);
        end.setHours(eh, em, 0, 0);
        const left = Math.max(0, Math.ceil((end.getTime() - currentTime) / 60000));
        return (
          <div className="sticky top-14 lg:top-16 z-40 anim-slide-up" style={{ background: "var(--primary)" }}>
            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2 flex items-center gap-2.5 text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 animate-pulse" />
              <span className="text-sm font-semibold truncate flex-1">{currentItem.subject}</span>
              <span className="text-xs font-bold tabular-nums shrink-0 whitespace-nowrap">{left} мин до конца</span>
            </div>
          </div>
        );
      })()}

      <WeekBar onWeekChange={handleWeekChange} selectedWeekStart={selectedWeekStart} />

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6 page-enter">
        {/* Новый учебный год — курс не сдвигается сам, просим проверить */}
        <CourseCheckBanner />

        {/* Выбор группы */}
        <div className="card mb-4 lg:mb-5">
          <h1 className="font-bold text-lg lg:text-2xl mb-2 lg:mb-3">Расписание занятий МГУ Душанбе</h1>
          {!profileGroupId && (
            <div className="flex items-start gap-2 rounded-lg bg-[var(--tag-bg)] px-3 py-2 mb-3 lg:mb-4">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <p className="text-xs lg:text-sm text-[var(--muted)]">Выберите группу ниже, затем нажмите на нужный день недели.</p>
            </div>
          )}
          <GroupSelector groups={groups} value={selectedGroup} onChange={loadGroup} collapsible />
          {selectedGroup && (
            <div className="flex flex-wrap gap-2 mt-3">
              <a
                href={api.getIcsUrl(selectedGroup.id)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--muted)] text-sm hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                download
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Google Calendar
              </a>
              <button
                onClick={handleShareImage}
                disabled={sharing}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--muted)] text-sm hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all active:scale-95 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" />
                </svg>
                {sharing ? "Готовим картинку..." : "Поделиться картинкой"}
              </button>
              {profileGroupId !== null && selectedGroup.id !== profileGroupId && (
                <button
                  onClick={restoreProfileGroup}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] text-sm hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all active:scale-95"
                >
                  Вернуться к моему расписанию
                </button>
              )}
            </div>
          )}
        </div>

        {/* На сегодня занятия кончились — показываем ближайший учебный день */}
        {selectedGroup && !loading && tomorrowItem && (
          <div className="card lesson-now mb-4 lg:mb-5 anim-rise">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-xs lg:text-sm font-semibold text-[var(--primary)]">НА СЕГОДНЯ ВСЁ</span>
              <span className="lesson-tag ml-auto">{tomorrowItem.pair_number} пара</span>
            </div>
            <p className="text-xs text-[var(--muted)] mb-1.5">
              {tomorrowItem.day_label} в {tomorrowItem.pair_time_start} — первая пара:
            </p>
            <p className="font-semibold text-sm lg:text-base">{tomorrowItem.subject}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {tomorrowItem.room && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold"
                  style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
                  ауд. {tomorrowItem.room}
                </span>
              )}
              {tomorrowItem.teacher && (
                <span className="text-xs lg:text-sm text-[var(--muted)]">{tomorrowItem.teacher}</span>
              )}
            </div>
          </div>
        )}

        {/* "Что сейчас" виджет — показываем только когда есть текущая или следующая пара */}
        {selectedGroup && !loading && (currentItem || nextItem) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 mb-4 lg:mb-5">
            {currentItem && (
              <div ref={nowCardRef} className="card lesson-now anim-rise">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse"></span>
                  <span className="text-xs lg:text-sm font-semibold text-[var(--primary)]">ИДЁТ СЕЙЧАС</span>
                  <span className="lesson-tag ml-auto">{currentItem.pair_number} пара</span>
                </div>
                <p className="font-semibold text-sm lg:text-base">{currentItem.subject}</p>
                <p className="text-xs lg:text-sm text-[var(--muted)] mt-1">
                  {currentItem.pair_time_start}–{currentItem.pair_time_end}
                  {currentItem.teacher && ` · ${currentItem.teacher}`}
                  {currentItem.room && ` · ауд. ${currentItem.room}`}
                </p>
                {(() => {
                  // Прогресс пары: сколько прошло из 90 минут — тающее кольцо вместо полоски
                  const [sh, sm] = currentItem.pair_time_start.split(":").map(Number);
                  const [eh, em] = currentItem.pair_time_end.split(":").map(Number);
                  const st = new Date(currentTime); st.setHours(sh, sm, 0, 0);
                  const en = new Date(currentTime); en.setHours(eh, em, 0, 0);
                  const p = (currentTime - st.getTime()) / (en.getTime() - st.getTime());
                  const left = Math.max(0, Math.ceil((en.getTime() - currentTime) / 60000));
                  return (
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <RadialProgress progress={1 - p} size={34} stroke={3.5}>
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: "var(--primary)" }}>{left}</span>
                      </RadialProgress>
                      <p className="text-xs text-[var(--muted)]">
                        осталось <b style={{ color: "var(--foreground)" }}>{left} мин</b> до конца пары
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
            {nextItem && (() => {
              // Прогресс перемены — тает по мере приближения к следующей паре
              let breakProgress: number | null = null;
              if (nextItem.break_minutes != null && nextItem.break_minutes > 0) {
                const [h, m] = nextItem.pair_time_start.split(":").map(Number);
                const start = new Date(currentTime);
                start.setHours(h, m, 0, 0);
                const leftMs = start.getTime() - currentTime;
                const totalMs = nextItem.break_minutes * 60_000;
                breakProgress = Math.min(1, Math.max(0, leftMs / totalMs));
              }
              return (
                <div className="card lesson-now anim-rise" style={{ "--d": "80ms" } as React.CSSProperties}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {/* Во время перемены важнее сказать «идёт перемена», чем «следующая» */}
                      <span className="text-xs lg:text-sm font-semibold text-[var(--primary)]">
                        {nextItem.break_minutes != null
                          ? breakLabel(nextItem.break_minutes).toUpperCase()
                          : "СЛЕДУЮЩАЯ"}
                      </span>
                      <span className="lesson-tag">{nextItem.pair_number} пара</span>
                    </div>
                    {countdown && (
                      breakProgress != null ? (
                        <RadialProgress progress={breakProgress} size={58} stroke={4}>
                          <span className="text-xs font-bold tabular-nums text-[var(--primary)] whitespace-nowrap">{countdown}</span>
                        </RadialProgress>
                      ) : (
                        <span className="text-lg lg:text-2xl font-bold tabular-nums text-[var(--primary)]">
                          {countdown}
                        </span>
                      )
                    )}
                  </div>
                  {nextItem.break_minutes != null && (
                    <p className="text-xs text-[var(--muted)] mb-1.5">
                      {nextItem.break_minutes <= 20
                        ? "Не уходи далеко — скоро начнётся:"
                        : "Дальше по расписанию:"}
                    </p>
                  )}
                  <p className="font-semibold text-sm lg:text-base">{nextItem.subject}</p>
                  {/* Аудиторию — отдельно и крупно: на перемене это главный вопрос */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {nextItem.room && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold"
                        style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
                        ауд. {nextItem.room}
                      </span>
                    )}
                    <span className="text-xs lg:text-sm text-[var(--muted)]">
                      {nextItem.pair_time_start}–{nextItem.pair_time_end}
                      {nextItem.teacher && ` · ${nextItem.teacher}`}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Статистика */}
        {stats && stats.total_lessons_week >= 3 && (
          <div className="card mb-4 lg:mb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-6">
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold tabular-nums text-[var(--primary)]">{stats.total_lessons_week}</div>
                <div className="text-xs lg:text-sm text-[var(--muted)] mt-1">пар в неделю</div>
              </div>
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold tabular-nums text-[var(--primary)]">{stats.unique_subjects}</div>
                <div className="text-xs lg:text-sm text-[var(--muted)] mt-1">предметов</div>
              </div>
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold tabular-nums text-[var(--primary)]">{stats.unique_teachers}</div>
                <div className="text-xs lg:text-sm text-[var(--muted)] mt-1">преподавателей</div>
              </div>
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold tabular-nums text-[var(--primary)]">
                  {stats.most_loaded_day ? DAY_SHORT[stats.most_loaded_day] : "—"}
                </div>
                <div className="text-xs lg:text-sm text-[var(--muted)] mt-1">загруженный день</div>
              </div>
            </div>
          </div>
        )}

        {/* Одноразовая подсказка — только когда функции включены и только своей группе */}
        {isMyGroup && (featureAttendance || featureNotes) && (
          <FeatureHint skips={featureAttendance} notes={featureNotes} />
        )}

        {/* Фильтр по дню */}
        {selectedGroup && (
          <div className="flex gap-1.5 lg:gap-3 flex-wrap mb-4 lg:mb-5">
            <button
              onClick={() => setSelectedDay("all")}
              className={`px-3 lg:px-5 py-1.5 lg:py-2.5 rounded-lg text-xs lg:text-base font-medium transition-all active:scale-95 ${selectedDay === "all"
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)]"
                }`}
            >
              Вся неделя
            </button>
            {visibleDays.map(day => {
              const hasLessons = lessons.some(l => l.day_of_week === day);
              const isActive = selectedDay === day;
              // Подсвечивать синей рамкой только когда выбран конкретный день, а не "вся неделя"
              const showHighlight = hasLessons && !isActive && selectedDay !== "all";
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`relative flex items-center gap-1 px-3 lg:px-5 min-h-[44px] rounded-lg text-xs lg:text-base font-medium transition-all active:scale-95 ${isActive
                    ? "bg-[var(--primary)] text-white"
                    : showHighlight
                      ? "bg-[var(--tag-bg)] border border-[var(--primary)] text-[var(--primary)]"
                      : "bg-[var(--card)] border border-[var(--border)] text-[var(--muted)]"
                    }`}
                >
                  <span className="lg:hidden">{DAY_SHORT[day]}</span>
                  <span className="hidden lg:inline">{DAY_LABELS[day]}</span>
                  {/* Точка-индикатор: есть пары, режим "вся неделя", кнопка не активна */}
                  {hasLessons && selectedDay === "all" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Расписание */}
        {loading && <ScheduleSkeleton rows={4} />}

        {error && (
          <div className="card text-sm flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            <span>⚠️ {error}</span>
            <button
              onClick={() => (groups.length === 0 ? loadInitialGroups() : selectedGroup && loadGroup(selectedGroup))}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
              style={{ background: "var(--primary)" }}
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && selectedGroup && Object.keys(lessonsByDay).length === 0 && (
          <div className="text-center py-16 text-[var(--muted)]">
            {isVacation && lessons.length === 0 ? (
              <>
                <svg className="w-12 h-12 mx-auto mb-3 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
                <p className="font-semibold text-base" style={{ color: "var(--foreground)" }}>Каникулы!</p>
                <p className="text-xs mt-1">Занятий нет — отдыхаем. Расписание появится ближе к 1 сентября.</p>
              </>
            ) : (
              <>
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {selectedDay !== "all" ? (
                  <>
                    <p className="font-medium">{DAY_IN[selectedDay]} занятий нет</p>
                    <p className="text-xs mt-1">Выходной или нет пар в этот день</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">На этой неделе занятий нет</p>
                    <p className="text-xs mt-1">Идёт сессия или каникулы</p>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {!loading && !selectedGroup && !error && (
          <div className="text-center py-16 text-[var(--muted)]">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="font-medium">Выберите группу выше</p>
            <p className="text-xs mt-1">Чтобы увидеть расписание</p>
          </div>
        )}

        <div
          {...swipe}
          key={selectedDay}
          className={`grid grid-cols-1 lg:grid-cols-2 gap-x-6${slideDir ? ` slide-${slideDir}` : ""}`}
        >
          {Object.entries(lessonsByDay).map(([day, dayLessons], idx) => (
            <DaySchedule
              key={day}
              dayLabel={DAY_LABELS[day]}
              lessons={dayLessons}
              showAttendance={featureAttendance && isMyGroup}
              showNotes={featureNotes && isMyGroup}
              todayIso={today}
              nowMinutes={nowMinutes}
              dimPast={isCurrentWeek}
              order={idx}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
