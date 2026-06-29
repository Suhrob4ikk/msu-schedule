"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import WeekBar from "@/components/WeekBar";
import LessonCard from "@/components/LessonCard";
import NotificationToggle from "@/components/NotificationToggle";
import { api, Group, Lesson, TodayItem, Stats, WeekInfo, DAYS_ORDER } from "@/lib/api";
import GroupSelector from "@/components/GroupSelector";

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

export default function HomePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const FEATURES_LOCKED = true; // Снять в сентябре 2026
  const [featureAttendance] = useState(() =>
    !FEATURES_LOCKED && typeof window !== "undefined" ? localStorage.getItem("feature_attendance") === "1" : false
  );
  const [featureNotes] = useState(() =>
    !FEATURES_LOCKED && typeof window !== "undefined" ? localStorage.getItem("feature_notes") === "1" : false
  );
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
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [nowItems, setNowItems] = useState<TodayItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<number | undefined>(undefined);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");

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

  useEffect(() => {
    const savedGroup = localStorage.getItem("selected_group_id");
    const viewedGroup = localStorage.getItem("schedule_view_group_id");
    const deviceId = localStorage.getItem("msu_device_id_v2");

    if (!savedGroup || !deviceId) {
      router.push("/profile");
      return;
    }

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

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Баннер «Включите уведомления о зачётах»
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem("push_subscribed") === "1") return;
    const until = localStorage.getItem("notif_banner_dismissed_until");
    if (until && new Date(until) > new Date()) return;
    const registered = localStorage.getItem("msu_device_id_v2");
    if (!registered) return;
    setShowNotifBanner(true);
  }, []);

  const dismissNotifBanner = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    localStorage.setItem("notif_banner_dismissed_until", d.toISOString());
    setShowNotifBanner(false);
  };

  const enableNotifFromBanner = async () => {
    const sessionId = localStorage.getItem("msu_device_id_v2");
    const groupId = Number(localStorage.getItem("selected_group_id") || "0");
    if (!sessionId || !groupId) return;
    const { subscribePush } = await import("@/lib/push");
    const status = await subscribePush(sessionId, groupId);
    if (status === "subscribed") setShowNotifBanner(false);
    else if (status === "denied") setShowNotifBanner(false);
  };

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
      <WeekBar onWeekChange={handleWeekChange} selectedWeekStart={selectedWeekStart} />

      {/* Баннер «Включи уведомления» — показывается один раз для зарегистрированных */}
      {showNotifBanner && (
        <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-3 lg:pt-4">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 border" style={{ background: "var(--card)", borderColor: "var(--primary)", borderWidth: 1.5 }}>
            <span className="text-xl shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Напоминания о зачётах и экзаменах</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Предупредим накануне и в день — не забудешь подготовиться</p>
            </div>
            <button
              onClick={enableNotifFromBanner}
              className="shrink-0 text-xs font-bold px-3 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              Включить
            </button>
            <button onClick={dismissNotifBanner} className="shrink-0 text-lg leading-none" style={{ color: "var(--muted)" }}>✕</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">
        {/* Выбор группы */}
        <div className="card mb-4 lg:mb-5">
          <h1 className="font-bold text-lg lg:text-2xl mb-2 lg:mb-3">Расписание занятий МГУ Душанбе</h1>
          {!profileGroupId && (
            <div className="flex items-start gap-2 rounded-lg bg-[var(--tag-bg)] px-3 py-2 mb-3 lg:mb-4">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <p className="text-xs lg:text-sm text-[var(--muted)]">Выберите группу ниже, затем нажмите на нужный день недели.</p>
            </div>
          )}
          <GroupSelector groups={groups} value={selectedGroup} onChange={loadGroup} />
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
              {profileGroupId !== null && selectedGroup.id !== profileGroupId && (
                <button
                  onClick={restoreProfileGroup}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] text-sm hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                >
                  Вернуться к моему расписанию
                </button>
              )}
              <NotificationToggle />
            </div>
          )}
        </div>

        {/* "Что сейчас" виджет */}
        {selectedGroup && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 mb-4 lg:mb-5">
            {currentItem ? (
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
            ) : (
              <div className="card flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-[var(--border)] shrink-0"></span>
                <span className="text-sm text-[var(--muted)]">Сейчас занятий нет</span>
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
              className={`px-3 lg:px-5 py-1.5 lg:py-2.5 rounded-lg text-xs lg:text-base font-medium transition-colors ${selectedDay === "all"
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
                  className={`relative flex items-center gap-1 px-3 lg:px-5 min-h-[44px] rounded-lg text-xs lg:text-base font-medium transition-colors ${isActive
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
                  showAttendance={featureAttendance}
                  showNotes={featureNotes}
                />
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
