"use client";
import { Lesson } from "@/lib/api";

const typeLabels: Record<string, string> = {
  ЗАЧЕТ: "Зачёт",
  ЭКЗАМЕН: "Экзамен",
  ПРАКТИКА: "Практика",
  Практика: "Практика",
  ЛЕКЦИЯ: "Лекция",
};

const typeClasses: Record<string, string> = {
  ЗАЧЕТ: "badge-credit",
  ЭКЗАМЕН: "badge-exam",
  ПРАКТИКА: "badge-practice",
  Практика: "badge-practice",
  ЛЕКЦИЯ: "badge-lecture",
};

interface Props {
  lesson: Lesson;
  showGroup?: boolean;
  isCurrent?: boolean;
  isNext?: boolean;
  sessionId?: string;
  onNote?: (lesson: Lesson) => void;
  attended?: boolean | null;
  onAttendance?: (lessonId: number, attended: boolean) => void;
}

export default function LessonCard({
  lesson, showGroup, isCurrent, isNext, sessionId,
  onNote, attended, onAttendance,
}: Props) {
  const badgeClass = lesson.lesson_type
    ? (typeClasses[lesson.lesson_type] || "badge-lecture")
    : "";

  return (
    <div
      className={`card mb-2 transition-all ${
        isCurrent ? "lesson-current shadow-lg" :
        isNext ? "lesson-next" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Время и номер пары */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold text-[var(--primary)] bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
              {lesson.pair_number} пара
            </span>
            {lesson.pair_time_start && (
              <span className="text-xs text-[var(--muted)]">
                {lesson.pair_time_start} – {lesson.pair_time_end}
              </span>
            )}
            {isCurrent && (
              <span className="badge" style={{ background: "#dcfce7", color: "#166534" }}>
                ● Идёт сейчас
              </span>
            )}
            {isNext && (
              <span className="badge" style={{ background: "#dbeafe", color: "#1e40af" }}>
                Следующая
              </span>
            )}
          </div>

          {/* Название предмета */}
          <h3 className="font-semibold text-sm leading-tight mb-1">
            {lesson.subject}
            {lesson.lesson_type && (
              <span className={`badge ml-2 ${badgeClass}`}>
                {typeLabels[lesson.lesson_type] || lesson.lesson_type}
              </span>
            )}
          </h3>

          {/* Преподаватель и аудитория */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
            {lesson.teacher && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/>
                </svg>
                {lesson.teacher.name}
              </span>
            )}
            {lesson.room && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
                </svg>
                Ауд. {lesson.room.name}
              </span>
            )}
            {showGroup && lesson.group && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
                </svg>
                {lesson.group.name}
              </span>
            )}
          </div>
        </div>

        {/* Кнопки действий */}
        {sessionId && (
          <div className="flex flex-col gap-1 shrink-0">
            {onAttendance && (
              <div className="flex gap-1">
                <button
                  onClick={() => onAttendance(lesson.id, true)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    attended === true
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 dark:bg-slate-700 hover:bg-green-100 dark:hover:bg-green-900"
                  }`}
                  title="Был"
                >✓</button>
                <button
                  onClick={() => onAttendance(lesson.id, false)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    attended === false
                      ? "bg-red-500 text-white"
                      : "bg-gray-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900"
                  }`}
                  title="Не был"
                >✗</button>
              </div>
            )}
            {onNote && (
              <button
                onClick={() => onNote(lesson)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                title="Заметка"
              >📝</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
