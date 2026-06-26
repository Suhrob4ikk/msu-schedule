"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import WeekBar from "@/components/WeekBar";
import LessonCard from "@/components/LessonCard";
import { api, Group, Lesson, TodayItem, Stats, WeekInfo, DAYS_ORDER } from "@/lib/api";

const DAY_LABELS: Record<string, string> = {
  понедельник: "Понедельник", вторник: "Вторник", среда: "Среда",
  четверг: "Четверг", пятница: "Пятница", суббота: "Суббота", воскресенье: "Воскресенье",
};

const DAY_SHORT: Record<string, string> = {
  понедельник: "Пн", вторник: "Вт", среда: "Ср",
  четверг: "Чт", пятница: "Пт", суббота: "Сб", воскресенье: "Вс",
};

export default function HomePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [nowItems, setNowItems] = useState<TodayItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<number | undefined>(undefined);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");

  useEffect(() => {
    const savedId = localStorage.getItem("selected_group_id");
    const deviceId = localStorage.getItem("msu_device_id_v2");
    // Новый пользователь или ещё не регистрировался — отправляем на страницу настройки
    if (!savedId || !deviceId) { router.push("/profile"); return; }

    api.getGroups()
      .then(gs => {
        setGroups(gs);
        if (savedId) {
          const g = gs.find(x => x.id === Number(savedId));
          if (g) loadGroup(g);
        }
      })
      .catch(() => setError("Нет соединения с сервером"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGroup = useCallback(async (group: Group, weekId?: number) => {
    setSelectedGroup(group);
    setLoading(true);
    setError(null);
    localStorage.setItem("selected_group_id", String(group.id));

    try {
      const [sched, now, st, wks] = await Promise.all([
        api.getGroupSchedule(group.id, undefined, weekId),
        api.getNow(group.id),
        api.getStats(group.id),
        api.getGroupWeeks(group.id),
      ]);
      setWeeks(wks);
      const activeWeek = weekId ? wks.find(w => w.id === weekId) : wks.find(w => w.is_latest);
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

  const currentItem = nowItems.find(i => i.is_current);
  const nextItem = nowItems.find(i => i.is_next);

  // Живой countdown — обновляется каждую секунду
  const [countdown, setCountdown] = useState<string>("");
  useEffect(() => {
    if (!nextItem) { setCountdown(""); return; }

    const tick = () => {
      const now = new Date();
      const [h, m] = nextItem.pair_time_start.split(":").map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);

      const diffMs = target.getTime() - now.getTime();
      if (diffMs <= 0) { setCountdown(""); return; }

      const totalMin = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;

      if (hrs > 0) {
        setCountdown(`${hrs}ч ${mins}м`);
      } else {
        setCountdown(`${mins}:${String(secs).padStart(2, "0")}`);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nextItem]);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Header />
      <WeekBar onWeekChange={handleWeekChange} selectedWeekStart={selectedWeekStart} />

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">
        {/* Выбор группы */}
        <div className="card mb-4 lg:mb-5">
          <h1 className="font-bold text-lg lg:text-2xl mb-3 lg:mb-4">Расписание занятий МГУ Душанбе</h1>
          <div className="flex flex-wrap gap-2 lg:gap-3">
            <select
              className="flex-1 min-w-48 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 lg:py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={selectedGroup?.id ?? ""}
              onChange={e => {
                const g = groups.find(x => x.id === Number(e.target.value));
                if (g) loadGroup(g);
              }}
            >
              <option value="">— Выберите группу —</option>
              {["ЕНФ", "ГФ"].map(fac => (
                <optgroup key={fac} label={fac === "ЕНФ" ? "Естественнонаучный факультет" : "Гуманитарный факультет"}>
                  {groups.filter(g => g.faculty_code === fac).map(g => (
                    <option key={g.id} value={g.id}>
                      {g.year} курс — {g.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selectedGroup && (
              <a
                href={api.getIcsUrl(selectedGroup.id)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--muted)] text-sm hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                download
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Google Calendar
              </a>
            )}
          </div>
        </div>

        {/* "Что сейчас" виджет */}
        {(currentItem || nextItem) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 mb-4 lg:mb-5">
            {currentItem && (
              <div className="card lesson-now">
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
              </div>
            )}
            {nextItem && (
              <div className="card lesson-now">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs lg:text-sm font-semibold text-[var(--primary)]">СЛЕДУЮЩАЯ</span>
                    <span className="lesson-tag">{nextItem.pair_number} пара</span>
                  </div>
                  {countdown && (
                    <span className="text-lg lg:text-2xl font-bold tabular-nums text-[var(--primary)]">
                      {countdown}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-sm lg:text-base">{nextItem.subject}</p>
                <p className="text-xs lg:text-sm text-[var(--muted)] mt-1">
                  {nextItem.pair_time_start}–{nextItem.pair_time_end}
                  {nextItem.teacher && ` · ${nextItem.teacher}`}
                  {nextItem.room && ` · ауд. ${nextItem.room}`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Статистика */}
        {stats && stats.total_lessons_week >= 3 && (
          <div className="card mb-4 lg:mb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-6">
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold text-[var(--primary)]">{stats.total_lessons_week}</div>
                <div className="text-xs lg:text-sm text-[var(--muted)] mt-1">пар в неделю</div>
              </div>
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold text-[var(--primary)]">{stats.unique_subjects}</div>
                <div className="text-xs lg:text-sm text-[var(--muted)] mt-1">предметов</div>
              </div>
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold text-[var(--primary)]">{stats.unique_teachers}</div>
                <div className="text-xs lg:text-sm text-[var(--muted)] mt-1">преподавателей</div>
              </div>
              <div className="text-center">
                <div className="text-2xl lg:text-4xl font-bold text-[var(--primary)]">
                  {stats.most_loaded_day ? DAY_SHORT[stats.most_loaded_day] : "—"}
                </div>
                <div className="text-xs lg:text-sm text-[var(--muted)] mt-1">загруженный день</div>
              </div>
            </div>
          </div>
        )}

        {/* Фильтр по дню */}
        {selectedGroup && (
          <div className="flex gap-1.5 lg:gap-3 flex-wrap mb-4 lg:mb-5">
            <button
              onClick={() => setSelectedDay("all")}
              className={`px-3 lg:px-5 py-1.5 lg:py-2.5 rounded-lg text-xs lg:text-base font-medium transition-colors ${
                selectedDay === "all"
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
                  className={`relative flex items-center gap-1 px-3 lg:px-5 min-h-[44px] rounded-lg text-xs lg:text-base font-medium transition-colors ${
                    isActive
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
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-[var(--muted)]">Загружаем расписание...</span>
          </div>
        )}

        {error && (
          <div className="card text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && selectedGroup && Object.keys(lessonsByDay).length === 0 && (
          <div className="text-center py-16 text-[var(--muted)]">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {selectedDay !== "all" ? (
              <>
                <p className="font-medium">В {DAY_LABELS[selectedDay].toLowerCase()} занятий нет</p>
                <p className="text-xs mt-1">Выходной или нет пар в этот день</p>
              </>
            ) : (
              <>
                <p className="font-medium">На этой неделе занятий нет</p>
                <p className="text-xs mt-1">Идёт сессия или каникулы</p>
              </>
            )}
          </div>
        )}

        {!loading && !selectedGroup && !error && (
          <div className="text-center py-16 text-[var(--muted)]">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <p className="font-medium">Выберите группу выше</p>
            <p className="text-xs mt-1">Чтобы увидеть расписание</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
          {Object.entries(lessonsByDay).map(([day, dayLessons]) => (
            <div key={day} className="mb-5 lg:mb-6">
              <h2 className="font-semibold text-sm lg:text-base text-[var(--foreground)] mb-2 lg:mb-3 flex items-center gap-2">
                {DAY_LABELS[day]}
                <span className="text-xs lg:text-sm font-normal normal-case">
                  {dayLessons[0]?.lesson_date &&
                    new Date(dayLessons[0].lesson_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </span>
              </h2>
              {dayLessons.map(lesson => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                />
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
