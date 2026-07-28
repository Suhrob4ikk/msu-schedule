"use client";
import { useState, useEffect } from "react";

/**
 * Одноразовая подсказка после включения «Пропусков» или «Заметок».
 * Объясняет, что делать, ровно один раз — потом больше не появляется.
 */
export default function FeatureHint({ skips, notes }: { skips: boolean; notes: boolean }) {
  const [visible, setVisible] = useState(false);
  const key = `hint_seen_${skips ? "s" : ""}${notes ? "n" : ""}`;

  useEffect(() => {
    if (!skips && !notes) { setVisible(false); return; }
    setVisible(localStorage.getItem(key) !== "1");
  }, [key, skips, notes]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(key, "1");
    setVisible(false);
  };

  return (
    <div className="card mb-4 lg:mb-5 flex items-start gap-3">
      <svg className="w-5 h-5 shrink-0 mt-0.5 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
      </svg>
      <div className="flex-1 min-w-0 text-xs lg:text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {skips && (
          <p>
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>Пропуски.</span>{" "}
            Отмечать нужно <b>только</b> пары, которые пропустил — если был, ничего нажимать не надо.
            Кнопка появляется у пар, которые уже прошли. Итог по предметам — в «Моём кабинете».
          </p>
        )}
        {notes && (
          <p className={skips ? "mt-2" : ""}>
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>Заметки.</span>{" "}
            Домашка, что принести, где встречаемся. По умолчанию заметка закрепляется за парой
            и появляется каждую неделю — это можно выключить при написании.
          </p>
        )}
      </div>
      <button
        onClick={dismiss}
        aria-label="Понятно, скрыть подсказку"
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--tag-bg)] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
