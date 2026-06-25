"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { api, Group, getSessionId } from "@/lib/api";

export default function ProfilePage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [subscription, setSubscription] = useState<{ group_id: number; group_name: string; year: number } | null>(null);
  const [attendance, setAttendance] = useState<{ total: number; attended: number; skipped: number; rate: number } | null>(null);
  const [notes, setNotes] = useState<Array<{ id: number; day_of_week: string; pair_number: string; note: string }>>([]);
  const [sessionId, setSessionId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const sid = getSessionId();
    setSessionId(sid);
    api.getGroups().then(setGroups);
    api.getSubscription(sid).then(setSubscription);
    api.getAttendance(sid).then(setAttendance);
    api.getNotes(sid).then(setNotes);
  }, []);

  const saveSubscription = async () => {
    if (!selectedGroupId || !sessionId) return;
    setSaving(true);
    const result = await api.subscribe(sessionId, Number(selectedGroupId));
    setSubscription(result);
    setSaving(false);
    localStorage.setItem("selected_group_id", String(selectedGroupId));
  };

  const runSync = async () => {
    setSyncRunning(true);
    setSyncResult(null);
    try {
      const result = await api.syncNow(true);
      const msgs = result.results?.map((r: { faculty: string; status: string; lessons?: number }) =>
        `${r.faculty}: ${r.status}${r.lessons ? ` (${r.lessons} занятий)` : ''}`
      ).join(", ");
      setSyncResult("Готово: " + msgs);
    } catch {
      setSyncResult("Ошибка синхронизации");
    } finally {
      setSyncRunning(false);
    }
  };

  const DAY_LABELS: Record<string, string> = {
    понедельник: "Пн", вторник: "Вт", среда: "Ср",
    четверг: "Чт", пятница: "Пт", суббота: "Сб",
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4 pb-24 lg:pb-6 space-y-4">
        <h1 className="font-bold text-xl">Мой кабинет</h1>

        {/* Выбор группы */}
        <div className="card">
          <h2 className="font-semibold mb-3">Моя группа</h2>
          {subscription && (
            <div className="mb-3 p-3 rounded-lg bg-[var(--accent)]">
              <p className="text-sm font-medium">{subscription.group_name}</p>
              <p className="text-xs text-[var(--muted)]">{subscription.year} курс</p>
            </div>
          )}
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              value={selectedGroupId}
              onChange={e => setSelectedGroupId(Number(e.target.value) || "")}
            >
              <option value="">— Выберите группу —</option>
              {["ЕНФ", "ГФ"].map(fac => (
                <optgroup key={fac} label={fac === "ЕНФ" ? "ЕНФ" : "ГФ"}>
                  {groups.filter(g => g.faculty_code === fac).map(g => (
                    <option key={g.id} value={g.id}>{g.year} курс — {g.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              onClick={saveSubscription}
              disabled={!selectedGroupId || saving}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "..." : "Сохранить"}
            </button>
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">
            ID сессии: <code className="font-mono">{sessionId.slice(0, 8)}...</code>
          </p>
        </div>

        {/* Посещаемость */}
        {attendance && attendance.total > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-3">Моя посещаемость</h2>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">{attendance.attended}</div>
                <div className="text-xs text-[var(--muted)]">Посетил</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">{attendance.skipped}</div>
                <div className="text-xs text-[var(--muted)]">Пропустил</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--primary)]">{attendance.rate}%</div>
                <div className="text-xs text-[var(--muted)]">Процент</div>
              </div>
            </div>
            {/* Прогресс-бар */}
            <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${attendance.rate}%`,
                  background: attendance.rate >= 75 ? "#22c55e" : attendance.rate >= 50 ? "#f59e0b" : "#ef4444"
                }}
              />
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">
              {attendance.rate < 75 && "⚠️ Посещаемость ниже нормы (75%)"}
              {attendance.rate >= 75 && "✅ Посещаемость в норме"}
            </p>
          </div>
        )}

        {/* Заметки */}
        {notes.length > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-3">Мои заметки ({notes.length})</h2>
            <div className="space-y-2">
              {notes.map(n => (
                <div key={n.id} className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900">
                  <div className="text-xs text-[var(--muted)] mb-1">
                    {DAY_LABELS[n.day_of_week]} · {n.pair_number} пара
                  </div>
                  <p className="text-sm">{n.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Синхронизация */}
        <div className="card">
          <h2 className="font-semibold mb-3">Синхронизация</h2>
          <p className="text-sm text-[var(--muted)] mb-3">
            Расписание автоматически обновляется каждые 2 часа с сайта msu.tj.
            Можно запустить вручную:
          </p>
          <button
            onClick={runSync}
            disabled={syncRunning}
            className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {syncRunning ? "Синхронизация..." : "Обновить сейчас"}
          </button>
          {syncResult && (
            <p className="text-xs text-[var(--muted)] mt-2">{syncResult}</p>
          )}
        </div>
      </main>
    </div>
  );
}
