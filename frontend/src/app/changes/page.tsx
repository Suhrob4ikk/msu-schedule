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

// Кружок-иконка перед строкой изменения (+ / − / ~), цвет по типу изменения —
// то же деление, что у бейджа сверху, просто ещё раз, но взглядом на саму строку.
const diffIcon: Record<string, { icon: string; className: string }> = {
  added: { icon: "+", className: "bg-green-500/15 text-green-600 dark:text-green-400" },
  removed: { icon: "−", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  changed: { icon: "~", className: "bg-[var(--primary-soft)] text-[var(--primary)]" },
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
  // Курс по id группы — для подписи в карточке изменения. Сервер отдаёт
  // только group_id и голое название («ГЕОЛОГИЯ»), а групп с одинаковым
  // названием на разных курсах несколько — без курса не понять, о ком речь.
  const [yearByGroupId, setYearByGroupId] = useState<Record<number, number>>({});
  // Пока не прочитали группу из localStorage, грузить нечего: иначе первый
  // проход эффекта тянул ленту по всем факультетам, а второй — уже по своей
  // группе. Два запроса подряд вместо одного.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Список групп нужен всегда (для курса в карточках), а не только тем,
    // у кого выбрана своя группа — поэтому запрос вынесен из ветки ниже.
    api.getGroups().then(groups => {
      setYearByGroupId(Object.fromEntries(groups.map(g => [g.id, g.year])));
    }).catch(() => {});

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
            <div className="flex gap-1 mt-3 p-1 rounded-xl border border-[var(--border)] bg-[var(--background)]">
              <button
                onClick={() => setOnlyMine(true)}
                className={`flex-1 min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                  onlyMine
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--foreground)]"
                }`}
              >
                Моя группа{profileGroupLabel ? ` · ${profileGroupLabel}` : ""}
              </button>
              <button
                onClick={() => setOnlyMine(false)}
                className={`flex-1 min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                  !onlyMine
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--foreground)]"
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
            const diff = diffIcon[c.change_type];
            // Одна строка вместо было/стало по отдельности: для "изменено" —
            // старое → новое, для добавлено/удалено — само значение.
            const diffText = c.change_type === "changed"
              ? (c.old_value && c.new_value ? `${c.old_value} → ${c.new_value}` : (c.new_value ?? c.old_value))
              : (c.new_value ?? c.old_value);
            return (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={tagClass}>{label}</span>
                    <span className="text-xs font-semibold text-[var(--muted)]">{c.faculty_code}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {shortGroupName(c.group_name ?? "")}
                      {c.group_id != null && yearByGroupId[c.group_id] != null ? ` · ${yearByGroupId[c.group_id]} курс` : ""}
                    </span>
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
                {diff && diffText && (
                  <div className="flex items-start gap-2 mt-2.5 text-sm">
                    <span className={`flex items-center justify-center w-[18px] h-[18px] rounded-full text-xs font-bold shrink-0 mt-0.5 ${diff.className}`}>
                      {diff.icon}
                    </span>
                    <span style={{ color: "var(--foreground)" }}>{diffText}</span>
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
