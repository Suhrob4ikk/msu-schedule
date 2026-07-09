"use client";
import { useState, useEffect } from "react";
import { Lesson, shortGroupName } from "@/lib/api";

const typeLabels: Record<string, string> = {
  ЗАЧЕТ: "Зачёт",
  ЭКЗАМЕН: "Экзамен",
  ПРАКТИКА: "Практика",
  Практика: "Практика",
  ПЗ: "Практика",
  ЛЕКЦИЯ: "Лекция",
};

// CSS-классы для цветных тегов (определены в globals.css, поддерживают dark mode)
const typeTagClass: Record<string, string> = {
  ЭКЗАМЕН: "lesson-tag-exam", Экзамен: "lesson-tag-exam",
  ЗАЧЕТ: "lesson-tag-exam", Зачёт: "lesson-tag-exam",
  ПРАКТИКА: "lesson-tag-practice", Практика: "lesson-tag-practice", ПЗ: "lesson-tag-practice",
};

// Тип пары → цвет левого акцента карточки (делает расписание сканируемым)
const typeKind: Record<string, string> = {
  ЭКЗАМЕН: "exam", Экзамен: "exam", ЗАЧЕТ: "exam", Зачёт: "exam",
  ПРАКТИКА: "practice", Практика: "practice", ПЗ: "practice",
  ЛЕКЦИЯ: "lecture", Лекция: "lecture",
};

interface Props {
  lesson: Lesson;
  showGroup?: boolean;
  showAttendance?: boolean;
  showNotes?: boolean;
}

export default function LessonCard({ lesson, showGroup, showAttendance, showNotes }: Props) {
  const shortGroup = lesson.group ? shortGroupName(lesson.group.name) : null;
  const kind = lesson.lesson_type ? (typeKind[lesson.lesson_type] || "default") : "default";

  // Ключи НЕ по lesson.id (он меняется при каждой синхронизации), а по стабильным
  // признакам: посещаемость — на конкретную дату, заметка — к слоту день+пара.
  const gid = lesson.group?.id ?? "g";
  const attKey = `att2_${gid}_${lesson.lesson_date ?? lesson.day_of_week}_${lesson.pair_number}`;
  const noteKey = `note2_${gid}_${lesson.day_of_week}_${lesson.pair_number}`;

  // Читаем после монтирования (SSR-безопасно; карточки рендерятся и на сервере)
  const [attended, setAttended] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);

  useEffect(() => {
    if (showAttendance) {
      const v = localStorage.getItem(attKey);
      setAttended(v === "1" ? true : v === "0" ? false : null);
    }
    if (showNotes) setNote(localStorage.getItem(noteKey) ?? "");
  }, [attKey, noteKey, showAttendance, showNotes]);

  const markAttendance = (value: boolean) => {
    if (attended === value) {
      setAttended(null);
      localStorage.removeItem(attKey);
    } else {
      setAttended(value);
      localStorage.setItem(attKey, value ? "1" : "0");
    }
  };

  const saveNote = (text: string) => {
    setNote(text);
    if (text.trim()) {
      localStorage.setItem(noteKey, text);
    } else {
      localStorage.removeItem(noteKey);
    }
  };

  return (
    <div className="card lesson-accent mb-2 lg:mb-2.5" data-kind={kind}>
      {/* Номер пары + время + тип */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="lesson-tag lesson-time">
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
      <p className="font-semibold text-base lg:text-lg leading-snug mb-2" style={{ color: "var(--foreground)" }}>
        {lesson.subject}
      </p>

      {/* Преподаватель, аудитория, группа */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:text-base" style={{ color: "var(--muted)" }}>
        {lesson.teacher && (
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
            </svg>
            {lesson.teacher.name}
          </span>
        )}
        {lesson.room && (
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            Ауд. {lesson.room.name}
          </span>
        )}
        {showGroup && lesson.group && shortGroup && (
          <span className="flex min-w-0 items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            <span className="truncate">{lesson.group.year} курс · {shortGroup}</span>
          </span>
        )}
      </div>

      {/* Посещаемость */}
      {showAttendance && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--muted)] mr-1">Был?</span>
          <button
            onClick={() => markAttendance(true)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              attended === true
                ? "bg-green-500 text-white border-green-500"
                : "border-[var(--border)] text-[var(--muted)] hover:border-green-400 hover:text-green-600"
            }`}
          >
            ✓ Был
          </button>
          <button
            onClick={() => markAttendance(false)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              attended === false
                ? "bg-red-500 text-white border-red-500"
                : "border-[var(--border)] text-[var(--muted)] hover:border-red-400 hover:text-red-600"
            }`}
          >
            ✗ Не был
          </button>
        </div>
      )}

      {/* Заметки */}
      {showNotes && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          {editingNote || note ? (
            <textarea
              autoFocus={editingNote && !note}
              rows={2}
              placeholder="Заметка к паре..."
              className="w-full text-xs rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              style={{
                background: "var(--tag-bg)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
              value={note}
              onChange={e => saveNote(e.target.value)}
              onBlur={() => { if (!note.trim()) setEditingNote(false); }}
            />
          ) : (
            <button
              onClick={() => setEditingNote(true)}
              className="text-xs text-[var(--muted)] hover:text-[var(--primary)] transition-colors flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              Добавить заметку
            </button>
          )}
        </div>
      )}
    </div>
  );
}
