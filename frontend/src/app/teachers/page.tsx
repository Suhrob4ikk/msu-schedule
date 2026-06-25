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

  useEffect(() => {
    api.getTeachers().then(setTeachers);
  }, []);

  const loadTeacher = async (t: Teacher) => {
    setSelected(t);
    setLoading(true);
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
      <main className="max-w-6xl mx-auto px-4 py-4">
        <div className="card mb-4">
          <h1 className="font-bold text-lg mb-3">Расписание преподавателей</h1>
          <input
            type="search"
            placeholder="Поиск по фамилии..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Список преподавателей */}
          <div className="card lg:col-span-1 h-[calc(100vh-220px)] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-[var(--muted)] text-sm text-center py-4">Нет результатов</p>
            )}
            {filtered.map(t => (
              <button
                key={t.id}
                onClick={() => loadTeacher(t)}
                className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm transition-colors ${
                  selected?.id === t.id
                    ? "bg-[var(--primary)] text-white"
                    : "hover:bg-gray-100 dark:hover:bg-slate-700"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {/* Расписание выбранного преподавателя */}
          <div className="lg:col-span-2">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!selected && !loading && (
              <div className="text-center py-16 text-[var(--muted)]">
                <p>Выберите преподавателя из списка</p>
              </div>
            )}
            {selected && !loading && (
              <>
                <h2 className="font-bold mb-3">{selected.name}</h2>
                {Object.entries(lessonsByDay).map(([day, dayLessons]) => (
                  <div key={day} className="mb-4">
                    <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                      {DAY_LABELS[day]}
                    </h3>
                    {dayLessons.map(l => (
                      <LessonCard key={l.id} lesson={l} showGroup />
                    ))}
                  </div>
                ))}
                {Object.keys(lessonsByDay).length === 0 && (
                  <p className="text-[var(--muted)] text-center py-8">Занятий не найдено</p>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
