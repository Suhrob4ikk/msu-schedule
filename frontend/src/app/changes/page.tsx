"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { SkeletonCards } from "@/components/Skeletons";
import { api, Change, shortGroupName } from "@/lib/api";

const typeLabels: Record<string, string> = {
  added: "Добавлено",
  removed: "Удалено",
  changed: "Изменено",
  new_week: "Новая неделя",
};

const typeTagClass: Record<string, string> = {
  added: "lesson-tag lesson-tag-added",
  removed: "lesson-tag lesson-tag-removed",
  changed: "lesson-tag lesson-tag-changed",
  new_week: "lesson-tag lesson-tag-new-week",
};

const DAY_LABELS: Record<string, string> = {
  понедельник: "Пн", вторник: "Вт", среда: "Ср",
  четверг: "Чт", пятница: "Пт", суббота: "Сб",
};

const DAY_OFFSET: Record<string, number> = {
  понедельник: 0, вторник: 1, среда: 2, четверг: 3, пятница: 4, суббота: 5, воскресенье: 6,
};

// Точная дата изменения: начало недели + день («08.09»)
function changeDate(c: Change): string {
  if (!c.week_start || !c.day_of_week) return "";
  const d = new Date(c.week_start + "T00:00:00");
  d.setDate(d.getDate() + (DAY_OFFSET[c.day_of_week] ?? 0));
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ChangesPage() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Пусто на старте (совпадает с SSR), реальную группу и фильтр выставляем
  // после монтирования — иначе первый клиентский рендер разойдётся с
  // серверным (hydration #418).
  const [profileGroupId, setProfileGroupId] = useState<number | null>(null);
  const [profileGroupLabel, setProfileGroupLabel] = useState<string>("");
  const [onlyMine, setOnlyMine] = useState(false);
  // Пока не прочитали группу из localStorage, грузить нечего: иначе первый
  // проход эффекта тянул ленту по всем факультетам, а второй — уже по своей
  // группе. Два запроса подряд вместо одного.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("selected_group_id");
    if (!saved) { setReady(true); return; }
    const id = Number(saved);
    setProfileGroupId(id);
    setOnlyMine(true); // группа выбрана — по умолчанию фильтруем на неё
    setReady(true);
    api.getGroups().then(groups => {
      const g = groups.find(x => x.id === id);
      if (g) setProfileGroupLabel(`${shortGroupName(g.name)} · ${g.year} курс`);
    }).catch(() => {});
  }, []);

  const load = (groupId: number | null) => {
    setLoading(true);
    setError(false);
    api.getChanges(groupId ?? undefined)
      .then(data => {
        setChanges(data);
        setLoading(false);
        // Отмечаем момент просмотра — по нему в шапке гаснет бейдж «новое».
        if (data[0]?.detected_at) localStorage.setItem("changes_last_seen", data[0].detected_at);
      })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => {
    if (!ready) return;
    load(onlyMine ? profileGroupId : null);
  }, [ready, onlyMine, profileGroupId]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">
        <div className="card mb-4">
          <h1 className="font-bold text-lg">История изменений расписания</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Здесь видно что изменилось в расписании с последнего обновления.
          </p>
          {profileGroupId != null && (
            <div className="flex gap-1.5 mt-3">
              <button
                onClick={() => setOnlyMine(true)}
                className={`px-3 min-h-[36px] rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                  onlyMine
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)]"
                }`}
              >
                Моя группа{profileGroupLabel ? ` · ${profileGroupLabel}` : ""}
              </button>
              <button
                onClick={() => setOnlyMine(false)}
                className={`px-3 min-h-[36px] rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                  !onlyMine
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)]"
                }`}
              >
                Все факультеты
              </button>
            </div>
          )}
        </div>

        {loading && <SkeletonCards rows={6} label="Загружаем историю изменений" />}

        {error && (
          <div className="text-center py-16 text-[var(--muted)]">
            <p className="mb-3">Не удалось загрузить историю изменений</p>
            <button
              onClick={() => load(onlyMine ? profileGroupId : null)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && changes.length === 0 && (
          <div className="text-center py-16 text-[var(--muted)]">
            <p>{onlyMine ? "У твоей группы изменений пока нет" : "Изменений пока нет"}</p>
            <p className="text-xs mt-1">
              {onlyMine
                ? "Старые записи (до этого фильтра) видно только во «Все факультеты»"
                : "Они появятся после первого обновления расписания"}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {changes.map(c => {
            const label = typeLabels[c.change_type] || c.change_type;
            const tagClass = typeTagClass[c.change_type] ?? "lesson-tag";
            return (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={tagClass}>{label}</span>
                    <span className="text-xs font-semibold">{c.faculty_code}</span>
                    <span className="text-xs text-[var(--muted)]">{shortGroupName(c.group_name ?? "")}</span>
                    {c.day_of_week && c.pair_number && (
                      <span className="text-xs text-[var(--muted)]">
                        {DAY_LABELS[c.day_of_week]}{changeDate(c) ? `, ${changeDate(c)}` : ""} · {c.pair_number} пара
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
