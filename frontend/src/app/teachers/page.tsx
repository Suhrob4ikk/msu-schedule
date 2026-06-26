"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import LessonCard from "@/components/LessonCard";
import { api, Teacher, Lesson, DAYS_ORDER } from "@/lib/api";

const DAY_LABELS: Record<string, string> = {
  понедельник: "Понедельник", вторник: "Вторник", среда: "Среда",
  четверг: "Четверг", пятница: "Пятница", суббота: "Суббота",
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selected, setSelected] = useState<Teacher | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  useEffect(() => {
    api.getTeachers().then(setTeachers);
  }, []);

  const loadTeacher = async (t: Teacher) => {
    setSelected(t);
    setLoading(true);
    setMobileView("detail");
    try {
      const data = await api.getTeacherSchedule(t.id);
      setLessons(data);
    } finally {
      setLoading(false);
    }
  };

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const lessonsByDay = DAYS_ORDER.reduce((acc, day) => {
    const dayLessons = lessons.filter(l => l.day_of_week === day);
    if (dayLessons.length > 0) acc[day] = dayLessons;
    return acc;
  }, {} as Record<string, Lesson[]>);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">

        {/* Поиск — скрываем на мобиле в режиме детали */}
        <div className={`card mb-4 lg:mb-5 ${mobileView === "detail" ? "hidden lg:block" : ""}`}>
          <h1 className="font-bold text-lg lg:text-2xl mb-3 lg:mb-4">Расписание преподавателей</h1>
          <input
            type="search"
            placeholder="Поиск по фамилии..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 lg:py-3 text-sm lg:text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

          {/* Список преподавателей — скрывается на мобиле в режиме детали */}
          <div className={`lg:col-span-1 ${mobileView === "detail" ? "hidden lg:block" : ""}`}>
            <div className="card h-[calc(100vh-280px)] lg:h-[calc(100vh-200px)] overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-[var(--muted)] text-sm lg:text-base text-center py-4">Нет результатов</p>
              )}
              {filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => loadTeacher(t)}
                  className={`w-full text-left px-3 lg:px-4 py-3 lg:py-2.5 rounded-lg mb-1 text-sm lg:text-base transition-colors ${
                    selected?.id === t.id
                      ? "bg-[var(--primary)] text-white"
                      : "hover:bg-[var(--accent)] text-[var(--foreground)]"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Расписание — детальный вид */}
          <div className={`lg:col-span-2 ${mobileView === "list" ? "hidden lg:block" : ""}`}>

            {/* Кнопка назад — только мобиле */}
            {mobileView === "detail" && (
              <button
                onClick={() => setMobileView("list")}
                className="lg:hidden flex items-center gap-2 text-[var(--primary)] text-sm font-medium mb-4"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
                К списку преподавателей
              </button>
            )}

            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 lg:w-8 lg:h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!selected && !loading && (
              <div className="hidden lg:flex text-center py-16 text-[var(--muted)] items-center justify-center">
                <p className="text-sm lg:text-base">Выберите преподавателя из списка</p>
              </div>
            )}
            {selected && !loading && (
              <>
                <h2 className="font-bold text-base lg:text-xl mb-3 lg:mb-4">{selected.name}</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-5">
                  {Object.entries(lessonsByDay).map(([day, dayLessons]) => (
                    <div key={day} className="mb-4 lg:mb-5">
                      <h3 className="text-xs lg:text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 lg:mb-3">
                        {DAY_LABELS[day]}
                      </h3>
                      {dayLessons.map(l => (
                        <LessonCard key={l.id} lesson={l} showGroup />
                      ))}
                    </div>
                  ))}
                </div>
                {Object.keys(lessonsByDay).length === 0 && (
                  <p className="text-[var(--muted)] text-sm lg:text-base text-center py-8">Занятий не найдено</p>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
