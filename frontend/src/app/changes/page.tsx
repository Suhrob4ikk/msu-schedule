"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { api, Change } from "@/lib/api";

const typeLabels: Record<string, string> = {
  added:   "Добавлено",
  removed: "Удалено",
  changed: "Изменено",
};

const DAY_LABELS: Record<string, string> = {
  понедельник: "Пн", вторник: "Вт", среда: "Ср",
  четверг: "Чт", пятница: "Пт", суббота: "Сб",
};

export default function ChangesPage() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getChanges().then(data => { setChanges(data); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">
        <div className="card mb-4">
          <h1 className="font-bold text-lg">История изменений расписания</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Автоматически фиксируются при каждой синхронизации с msu.tj
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && changes.length === 0 && (
          <div className="text-center py-16 text-[var(--muted)]">
            <p>Изменений пока нет</p>
            <p className="text-xs mt-1">Они появятся после первого обновления расписания</p>
          </div>
        )}

        <div className="space-y-2">
          {changes.map(c => {
            const label = typeLabels[c.change_type] || c.change_type;
            return (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="lesson-tag">{label}</span>
                    <span className="text-xs font-semibold">{c.faculty_code}</span>
                    <span className="text-xs text-[var(--muted)]">{c.group_name}</span>
                    {c.day_of_week && c.pair_number && (
                      <span className="text-xs text-[var(--muted)]">
                        {DAY_LABELS[c.day_of_week]} · {c.pair_number} пара
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--muted)] shrink-0">
                    {new Date(c.detected_at).toLocaleDateString("ru-RU", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                    })}
                  </span>
                </div>
                {(c.old_value || c.new_value) && (
                  <div className="mt-2 text-xs space-y-1">
                    {c.old_value && (
                      <div className="flex gap-2">
                        <span className="text-red-500 shrink-0">−</span>
                        <span className="line-through text-[var(--muted)]">{c.old_value}</span>
                      </div>
                    )}
                    {c.new_value && (
                      <div className="flex gap-2">
                        <span className="text-green-500 shrink-0">+</span>
                        <span>{c.new_value}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
