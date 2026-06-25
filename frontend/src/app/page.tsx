"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import LessonCard from "@/components/LessonCard";
import { api, Group, Lesson, TodayItem, Stats, WeekInfo, DAYS_ORDER, PAIR_TIMES, getSessionId } from "@/lib/api";

const DAY_LABELS: Record<string, string> = {
  понедельник: "Понедельник", вторник: "Вторник", среда: "Среда",
  четверг: "Четверг", пятница: "Пятница", суббота: "Суббота",
};

export default function HomePage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [nowItems, setNowItems] = useState<TodayItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Record<number, boolean>>({});
  const [noteModal, setNoteModal] = useState<Lesson | null>(null);
  const [noteText, setNoteText] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [view, setView] = useState<"week" | "day">("week");
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<number | undefined>(undefined);

  useEffect(() => {
    setSessionId(getSessionId());
    api.getGroups().then(setGroups).catch(() => setError("Нет соединения с сервером"));

    // Восстанавливаем выбор группы
    const savedId = localStorage.getItem("selected_group_id");
    if (savedId) {
      api.getGroups().then(gs => {
        const g = gs.find(x => x.id === Number(savedId));
        if (g) loadGroup(g);
      });
    }
  }, []);

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
      setSelectedWeekId(weekId ?? wks.find(w => w.is_latest)?.id);
      setLessons(sched);
      setNowItems(now);
      setStats(st);

      // Загружаем посещаемость
      if (sessionId) {
        const att = await api.getAttendance(sessionId);
        const map: Record<number, boolean> = {};
        att.records.forEach(r => { map[r.lesson_id] = r.attended; });
        setAttendance(map);
      }
    } catch (e) {
      setError("Ошибка загрузки расписания");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const handleAttendance = async (lessonId: number, attended: boolean) => {
    if (!sessionId) return;
    await api.markAttendance(sessionId, lessonId, attended);
    setAttendance(prev => ({ ...prev, [lessonId]: attended }));
  };

  const handleSaveNote = async () => {
    if (!noteModal || !noteText.trim() || !sessionId) return;
    await api.addNote(sessionId, {
      group_id: selectedGroup!.id,
      day_of_week: noteModal.day_of_week,
      pair_number: noteModal.pair_number,
      note: noteText,
    });
    setNoteModal(null);
    setNoteText("");
  };

  const filteredLessons = selectedDay === "all"
    ? lessons
    : lessons.filter(l => l.day_of_week === selectedDay);

  const lessonsByDay = DAYS_ORDER.reduce((acc, day) => {
    const dayLessons = filteredLessons.filter(l => l.day_of_week === day);
    if (dayLessons.length > 0) acc[day] = dayLessons;
    return acc;
  }, {} as Record<string, Lesson[]>);

  const currentItem = nowItems.find(i => i.is_current);
  const nextItem = nowItems.find(i => i.is_next);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-4">
        {/* Выбор группы */}
        <div className="card mb-4">
          <h1 className="font-bold text-lg mb-3">Расписание занятий МГУ Душанбе</h1>
          <div className="flex flex-wrap gap-2">
            <select
              className="flex-1 min-w-48 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
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

        {/* Переключатель недель (архив) */}
        {weeks.length > 1 && (
          <div className="card mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[var(--muted)] shrink-0">Неделя:</span>
              {weeks.map((w) => {
                const d = new Date(w.week_start);
                const label = w.is_latest
                  ? "Текущая"
                  : `${d.getDate()} ${d.toLocaleString("ru-RU", { month: "short" })}`;
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      setSelectedWeekId(w.id);
                      if (selectedGroup) loadGroup(selectedGroup, w.id);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      selectedWeekId === w.id
                        ? "bg-[var(--primary)] text-white"
                        : "bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)]"
                    }`}
                  >
                    {label}
                    {w.is_latest && (
                      <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 inline-block align-middle" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* "Что сейчас" виджет */}
        {(currentItem || nextItem) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {currentItem && (
              <div className="card lesson-current">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-xs font-semibold text-green-600 dark:text-green-400">ИДЁТ СЕЙЧАС</span>
                </div>
                <p className="font-semibold">{currentItem.subject}</p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {currentItem.pair_time_start}–{currentItem.pair_time_end}
                  {currentItem.teacher && ` · ${currentItem.teacher}`}
                  {currentItem.room && ` · ауд. ${currentItem.room}`}
                </p>
              </div>
            )}
            {nextItem && (
              <div className="card lesson-next">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    СЛЕДУЮЩАЯ {nextItem.minutes_until != null && `через ${nextItem.minutes_until} мин.`}
                  </span>
                </div>
                <p className="font-semibold">{nextItem.subject}</p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {nextItem.pair_time_start}–{nextItem.pair_time_end}
                  {nextItem.teacher && ` · ${nextItem.teacher}`}
                  {nextItem.room && ` · ауд. ${nextItem.room}`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Статистика */}
        {stats && stats.total_lessons_week > 0 && (
          <div className="card mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--primary)]">{stats.total_lessons_week}</div>
                <div className="text-xs text-[var(--muted)]">пар в неделю</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-500">{stats.unique_subjects}</div>
                <div className="text-xs text-[var(--muted)]">предметов</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-500">{stats.unique_teachers}</div>
                <div className="text-xs text-[var(--muted)]">преподавателей</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">
                  {stats.most_loaded_day ? DAY_LABELS[stats.most_loaded_day]?.slice(0, 2) : "—"}
                </div>
                <div className="text-xs text-[var(--muted)]">загрузка</div>
              </div>
            </div>
            {/* Мини-бар-чарт по дням */}
            {Object.keys(stats.lessons_by_day).length > 0 && (
              <div className="mt-3 flex items-end gap-1.5 h-12">
                {DAYS_ORDER.map(day => {
                  const count = stats.lessons_by_day[day] || 0;
                  const max = Math.max(...Object.values(stats.lessons_by_day));
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-t bg-[var(--primary)] opacity-70 hover:opacity-100 transition-opacity"
                        style={{ height: max > 0 ? `${(count / max) * 40}px` : "2px" }}
                        title={`${DAY_LABELS[day]}: ${count} пар`}
                      />
                      <span className="text-[9px] text-[var(--muted)]">{day.slice(0, 2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Фильтр по дню */}
        {selectedGroup && (
          <div className="flex gap-1.5 flex-wrap mb-4">
            <button
              onClick={() => setSelectedDay("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedDay === "all"
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)]"
              }`}
            >
              Вся неделя
            </button>
            {DAYS_ORDER.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedDay === day
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)]"
                }`}
              >
                {DAY_LABELS[day]}
              </button>
            ))}
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
          <div className="card border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && selectedGroup && Object.keys(lessonsByDay).length === 0 && (
          <div className="text-center py-16 text-[var(--muted)]">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <p>Занятий не найдено</p>
            <p className="text-xs mt-1">Возможно, это сессионная неделя</p>
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

        {Object.entries(lessonsByDay).map(([day, dayLessons]) => (
          <div key={day} className="mb-5">
            <h2 className="font-semibold text-sm text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center gap-2">
              {DAY_LABELS[day]}
              <span className="text-xs font-normal normal-case">
                {dayLessons[0]?.lesson_date &&
                  new Date(dayLessons[0].lesson_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
              </span>
            </h2>
            {dayLessons.map(lesson => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                sessionId={sessionId}
                attended={attendance[lesson.id] ?? null}
                onAttendance={handleAttendance}
                onNote={setNoteModal}
              />
            ))}
          </div>
        ))}
      </main>

      {/* Модальное окно заметки */}
      {noteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setNoteModal(null)}
        >
          <div className="card w-full max-w-md">
            <h3 className="font-semibold mb-3">
              Заметка к паре: {noteModal.subject}
            </h3>
            <textarea
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              rows={4}
              placeholder="Напиши заметку к этой паре..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveNote}
                className="flex-1 bg-[var(--primary)] text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Сохранить
              </button>
              <button
                onClick={() => setNoteModal(null)}
                className="flex-1 border border-[var(--border)] rounded-lg py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
