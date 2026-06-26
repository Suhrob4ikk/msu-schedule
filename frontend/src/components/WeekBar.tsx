"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface WeekOption {
  week_start: string;
  week_number: number;
  is_latest: boolean;
}

interface Props {
  /** Вызывается когда пользователь явно переключает неделю */
  onWeekChange: (weekStart: string) => void;
  /** Текущая выбранная неделя (controlled из родителя) */
  selectedWeekStart?: string;
}

// Метка недели: "Эта неделя", "Следующая · 29 июн" или просто "29 июн"
function weekLabel(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateStr = `${start.getDate()} ${start.toLocaleString("ru-RU", { month: "short" })}`;
  if (today >= start && today <= end) return "Эта неделя";
  if (start > today && start.getTime() - today.getTime() <= 8 * 24 * 60 * 60 * 1000)
    return `Следующая · ${dateStr}`;
  return dateStr;
}

function isCurrentWeek(weekStart: string): boolean {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= start && today <= end;
}

export default function WeekBar({ onWeekChange, selectedWeekStart }: Props) {
  const [weeks, setWeeks] = useState<WeekOption[]>([]);

  useEffect(() => {
    api.getAllWeeks().then(ws => {
      setWeeks(ws);
      // Если родитель ещё не выбрал неделю — уведомляем о дефолтной
      if (!selectedWeekStart && ws.length > 0) {
        const saved = localStorage.getItem("selected_week_start");
        const initial = saved && ws.find(w => w.week_start === saved) ? saved : ws[0].week_start;
        onWeekChange(initial);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Не рендерим если только одна неделя
  if (weeks.length <= 1) return null;

  const handleSelect = (weekStart: string) => {
    localStorage.setItem("selected_week_start", weekStart);
    onWeekChange(weekStart);
    // Уведомляем другие вкладки через storage event
    window.dispatchEvent(new StorageEvent("storage", { key: "selected_week_start", newValue: weekStart }));
  };

  return (
    <div className="border-b border-[var(--border)]" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <span
          className="text-xs font-semibold shrink-0"
          style={{ color: "var(--muted)" }}
        >
          Неделя:
        </span>
        {weeks.map(w => {
          const active = selectedWeekStart === w.week_start;
          const current = isCurrentWeek(w.week_start);
          return (
            <button
              key={w.week_start}
              onClick={() => handleSelect(w.week_start)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
              style={
                active
                  ? { background: "var(--primary)", color: "#fff" }
                  : {
                      background: "var(--card)",
                      border: "0.5px solid var(--border)",
                      color: "var(--foreground)",
                    }
              }
            >
              {weekLabel(w.week_start)}
              {current && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: active ? "rgba(255,255,255,0.7)" : "var(--primary)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
