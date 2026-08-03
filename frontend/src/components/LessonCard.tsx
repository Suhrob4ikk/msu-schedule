"use client";
import { useState, useEffect } from "react";
import { Lesson, shortGroupName } from "@/lib/api";
import { skipKey, noteWeeklyKey, noteDatedKey, isPastLesson } from "@/lib/studyData";

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
  /** Внутри таймлайна время пары показано на рельсе слева — в карточке его
   *  прячем, чтобы не дублировать. На остальных страницах время нужно. */
  compactTime?: boolean;
}

export default function LessonCard({ lesson, showGroup, showAttendance, showNotes, compactTime }: Props) {
  const shortGroup = lesson.group ? shortGroupName(lesson.group.name) : null;
  const kind = lesson.lesson_type ? (typeKind[lesson.lesson_type] || "default") : "default";
  // На экзаменах/зачётах/консультациях посещаемость не отмечают — кнопки не показываем
  const attendanceApplicable = !/экзамен|зач|конс/i.test(lesson.lesson_type ?? "");

  // Ключи НЕ по lesson.id (он меняется при каждой синхронизации), а по стабильным
  // признакам — см. lib/studyData.ts.
  const gid = lesson.group?.id ?? "g";
  const date = lesson.lesson_date;
  const kSkip = date ? skipKey(gid, date, lesson.pair_number) : null;
  const kWeekly = noteWeeklyKey(gid, lesson.day_of_week, lesson.pair_number);
  const kDated = date ? noteDatedKey(gid, date, lesson.pair_number) : null;

  // Читаем после монтирования (SSR-безопасно; карточки рендерятся и на сервере)
  const [mounted, setMounted] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [note, setNote] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  const [editingNote, setEditingNote] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (showAttendance && kSkip) setSkipped(localStorage.getItem(kSkip) !== null);
    if (showNotes) {
      // Разовая заметка на эту дату важнее еженедельной
      const dated = kDated ? localStorage.getItem(kDated) : null;
      if (dated !== null) { setNote(dated); setRepeatWeekly(false); }
      else { setNote(localStorage.getItem(kWeekly) ?? ""); setRepeatWeekly(true); }
    }
  }, [kSkip, kWeekly, kDated, showAttendance, showNotes]);

  // Отмечать пропуск можно только у уже прошедшей пары (у будущей это бессмысленно)
  const canMarkSkip = mounted && attendanceApplicable && !!kSkip && isPastLesson(date);

  const toggleSkip = () => {
    if (!kSkip) return;
    if (skipped) {
      setSkipped(false);
      localStorage.removeItem(kSkip);
    } else {
      setSkipped(true);
      // В значении — предмет, чтобы в кабинете считать пропуски по предметам
      localStorage.setItem(kSkip, lesson.subject);
    }
  };

  /** Пишем в один ключ и чистим второй, чтобы заметка не задвоилась. */
  const persistNote = (text: string, repeat: boolean) => {
    if (kDated) localStorage.removeItem(kDated);
    localStorage.removeItem(kWeekly);
    if (!text.trim()) return;
    localStorage.setItem(repeat || !kDated ? kWeekly : kDated, text);
  };

  const saveNote = (text: string) => {
    setNote(text);
    persistNote(text, repeatWeekly);
  };

  const toggleRepeat = () => {
    const next = !repeatWeekly;
    setRepeatWeekly(next);
    persistNote(note, next);
  };

  return (
    <div className="card lesson-accent mb-2 lg:mb-2.5" data-kind={kind}>
      {/* Номер пары + время + тип */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="lesson-tag lesson-time">
          {lesson.pair_number} пара
          {!compactTime && lesson.pair_time_start && ` · ${lesson.pair_time_start}–${lesson.pair_time_end}`}
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

      {/* Пропуск: отмечаем только то, что пропустили */}
      {showAttendance && canMarkSkip && (
        <div className="flex items-center mt-3 pt-3 border-t border-[var(--border)]">
          <button
            onClick={toggleSkip}
            aria-pressed={skipped}
            className={`flex items-center gap-1.5 px-3 min-h-[32px] rounded-lg text-xs font-semibold border transition-colors ${
              skipped
                ? "bg-red-500 text-white border-red-500"
                : "border-[var(--border)] text-[var(--muted)] hover:border-red-400 hover:text-red-600"
            }`}
          >
            {skipped ? (
              <>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z" clipRule="evenodd" />
                </svg>
                Пропустил
              </>
            ) : (
              "Отметить пропуск"
            )}
          </button>
          {skipped && (
            <span className="text-[11px] text-[var(--muted)] ml-2">нажми ещё раз, чтобы убрать</span>
          )}
        </div>
      )}

      {/* Заметки */}
      {showNotes && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          {!editingNote && note ? (
            /* Компактная строка-индикатор: заметка видна, клик — редактирование */
            <button
              onClick={() => setEditingNote(true)}
              className="w-full flex items-start gap-1.5 text-left text-xs leading-relaxed hover:opacity-80 transition-opacity"
              style={{ color: "var(--foreground)" }}
            >
              <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--primary)]" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              <span>{note}</span>
            </button>
          ) : editingNote ? (
            <>
              <textarea
                autoFocus
                rows={2}
                placeholder="Что задали? Что принести на пару?"
                className="w-full text-xs rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                style={{
                  background: "var(--tag-bg)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
                value={note}
                onChange={e => saveNote(e.target.value)}
                onBlur={() => setEditingNote(false)}
              />
              {/* Заметка либо висит на этой паре каждую неделю, либо только на эту дату */}
              {kDated && (
                <button
                  onMouseDown={e => e.preventDefault()} /* чтобы textarea не потеряла фокус раньше клика */
                  onClick={toggleRepeat}
                  className="flex items-center gap-1.5 mt-1.5 text-[11px] transition-colors"
                  style={{ color: repeatWeekly ? "var(--primary)" : "var(--muted)" }}
                >
                  <span
                    className="flex items-center justify-center w-3.5 h-3.5 rounded border"
                    style={{
                      borderColor: repeatWeekly ? "var(--primary)" : "var(--border)",
                      background: repeatWeekly ? "var(--primary)" : "transparent",
                    }}
                  >
                    {repeatWeekly && (
                      <svg width="9" height="9" viewBox="0 0 20 20" fill="#fff">
                        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                  Повторять каждую неделю
                </button>
              )}
            </>
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
