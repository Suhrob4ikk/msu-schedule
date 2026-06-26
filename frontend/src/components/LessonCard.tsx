"use client";
import { Lesson } from "@/lib/api";

const typeLabels: Record<string, string> = {
  ЗАЧЕТ: "Зачёт",
  ЭКЗАМЕН: "Экзамен",
  ПРАКТИКА: "Практика",
  Практика: "Практика",
  ЛЕКЦИЯ: "Лекция",
};

// CSS-классы для цветных тегов (определены в globals.css, поддерживают dark mode)
const typeTagClass: Record<string, string> = {
  ЭКЗАМЕН: "lesson-tag-exam", Экзамен: "lesson-tag-exam",
  ЗАЧЕТ:   "lesson-tag-exam", Зачёт:   "lesson-tag-exam",
  ПРАКТИКА:"lesson-tag-practice", Практика:"lesson-tag-practice", ПЗ:"lesson-tag-practice",
};

interface Props {
  lesson: Lesson;
  showGroup?: boolean;
}

export default function LessonCard({ lesson, showGroup }: Props) {
  return (
    <div className="card mb-2 lg:mb-2.5">
      {/* Номер пары + время + тип */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="lesson-tag">
          {lesson.pair_number} пара
          {lesson.pair_time_start && ` · ${lesson.pair_time_start}–${lesson.pair_time_end}`}
        </span>
        {lesson.lesson_type && (
          <span className={`lesson-tag ${typeTagClass[lesson.lesson_type] || ""}`}>
            {typeLabels[lesson.lesson_type] || lesson.lesson_type}
          </span>
        )}
      </div>

      {/* Название предмета */}
      <p className="font-medium text-sm lg:text-base leading-snug mb-2" style={{ color: "var(--foreground)" }}>
        {lesson.subject}
      </p>

      {/* Преподаватель, аудитория, группа */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs lg:text-sm" style={{ color: "var(--muted)" }}>
        {lesson.teacher && (
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/>
            </svg>
            {lesson.teacher.name}
          </span>
        )}
        {lesson.room && (
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
            </svg>
            Ауд. {lesson.room.name}
          </span>
        )}
        {showGroup && lesson.group && (
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
            </svg>
            {lesson.group.year} курс · {lesson.group.name}
          </span>
        )}
      </div>
    </div>
  );
}
