"use client";
import { useState, useEffect } from "react";
import { api, Group, getSessionId } from "@/lib/api";
import GroupSelector from "@/components/GroupSelector";

interface Props {
  onComplete: (group: Group) => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGroups().then(g => { setGroups(g); setLoading(false); });
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    localStorage.setItem("selected_group_id", String(selected.id));
    const sid = getSessionId();
    if (sid) api.subscribe(sid, selected.id).catch(() => {});
    onComplete(selected);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[var(--background)] flex flex-col items-center px-6 py-12 overflow-y-auto">
      {/* Логотип */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-3xl bg-[var(--primary)] flex items-center justify-center shadow-xl mb-4">
          <span className="text-white text-2xl font-bold">МГУ</span>
        </div>
        <h1 className="text-2xl font-bold text-center">Добро пожаловать!</h1>
        <p className="text-[var(--muted)] text-center mt-2 text-sm max-w-xs">
          Выберите направление и курс, чтобы видеть своё расписание
        </p>
      </div>

      {/* Выбор группы */}
      <div className="w-full max-w-sm mb-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <GroupSelector groups={groups} value={selected} onChange={setSelected} />
        )}
      </div>

      {/* Кнопка продолжить */}
      <div className="w-full max-w-sm">
        <button
          onClick={handleContinue}
          disabled={!selected}
          className="w-full py-3.5 rounded-2xl bg-[var(--primary)] text-white font-semibold text-base transition-all duration-150 disabled:opacity-30 hover:opacity-90 active:scale-95 shadow-lg"
        >
          Продолжить →
        </button>
        {!selected && (
          <p className="text-center text-xs text-[var(--muted)] mt-3">
            Сначала выберите направление и курс
          </p>
        )}
      </div>
    </div>
  );
}
