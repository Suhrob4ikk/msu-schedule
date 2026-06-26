"use client";
import { useState, useEffect } from "react";
import { api, Group, getSessionId } from "@/lib/api";

interface Props {
  onComplete: (group: Group) => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGroups().then(g => { setGroups(g); setLoading(false); });
  }, []);

  const handleContinue = () => {
    const group = groups.find(g => g.id === selectedId);
    if (!group) return;
    localStorage.setItem("selected_group_id", String(group.id));
    // Регистрируем подписку на бэкенде, чтобы профиль её увидел
    const sid = getSessionId();
    if (sid) api.subscribe(sid, group.id).catch(() => {});
    onComplete(group);
  };

  const faculties: Array<{ code: string; name: string }> = [
    { code: "ЕНФ", name: "Естественнонаучный факультет" },
    { code: "ГФ", name: "Гуманитарный факультет" },
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-[var(--background)] flex flex-col items-center px-6 py-12 overflow-y-auto">
      {/* Логотип */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-3xl bg-[var(--primary)] flex items-center justify-center shadow-xl mb-4">
          <span className="text-white text-2xl font-bold">МГУ</span>
        </div>
        <h1 className="text-2xl font-bold text-center">Добро пожаловать!</h1>
        <p className="text-[var(--muted)] text-center mt-2 text-sm max-w-xs">
          Выберите вашу учебную группу, чтобы видеть своё расписание
        </p>
      </div>

      {/* Выбор группы */}
      <div className="w-full max-w-sm mb-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {faculties.map(({ code, name }) => {
              const facGroups = groups.filter(g => g.faculty_code === code);
              if (facGroups.length === 0) return null;
              const years = [...new Set(facGroups.map(g => g.year))].sort();

              return (
                <div key={code}>
                  <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
                    {name}
                  </p>
                  {years.map(year => {
                    const yearGroups = facGroups.filter(g => g.year === year);
                    return (
                      <div key={year} className="mb-3">
                        <p className="text-xs text-[var(--muted)] mb-2">{year} курс</p>
                        <div className="flex flex-wrap gap-2">
                          {yearGroups.map(g => {
                            const active = selectedId === g.id;
                            return (
                              <button
                                key={g.id}
                                onClick={() => setSelectedId(g.id)}
                                className={`px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all duration-150 ${
                                  active
                                    ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-md scale-105"
                                    : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:bg-[var(--tag-bg)]"
                                }`}
                              >
                                {g.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Кнопка продолжить */}
      <div className="w-full max-w-sm">
        <button
          onClick={handleContinue}
          disabled={!selectedId}
          className="w-full py-3.5 rounded-2xl bg-[var(--primary)] text-white font-semibold text-base transition-all duration-150 disabled:opacity-30 hover:opacity-90 active:scale-95 shadow-lg"
        >
          Продолжить →
        </button>
        {!selectedId && (
          <p className="text-center text-xs text-[var(--muted)] mt-3">
            Сначала выберите группу
          </p>
        )}
      </div>
    </div>
  );
}
