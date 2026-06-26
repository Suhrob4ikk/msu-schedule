"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { api, DAYS_ORDER, PAIR_TIMES } from "@/lib/api";

const DAY_LABELS: Record<string, string> = {
  понедельник: "Понедельник", вторник: "Вторник", среда: "Среда",
  четверг: "Четверг", пятница: "Пятница", суббота: "Суббота",
};

export default function RoomsPage() {
  const [day, setDay] = useState("понедельник");
  const [pair, setPair] = useState("I");
  const [rooms, setRooms] = useState<Array<{ room_name: string; is_free: boolean; occupied_by?: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getFreeRooms(day, pair)
      .then(setRooms)
      .finally(() => setLoading(false));
  }, [day, pair]);

  const freeRooms = rooms.filter(r => r.is_free);
  const busyRooms = rooms.filter(r => !r.is_free);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">
        <div className="card mb-4 lg:mb-5">
          <h1 className="font-bold text-lg lg:text-2xl mb-3 lg:mb-4">Свободные аудитории</h1>
          <div className="flex flex-wrap gap-3 lg:gap-4">
            <div className="flex-1 min-w-36">
              <label className="block text-xs lg:text-sm text-[var(--muted)] mb-1">День недели</label>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 lg:py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                value={day}
                onChange={e => setDay(e.target.value)}
              >
                {DAYS_ORDER.map(d => (
                  <option key={d} value={d}>{DAY_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-36">
              <label className="block text-xs lg:text-sm text-[var(--muted)] mb-1">Номер пары</label>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 lg:py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                value={pair}
                onChange={e => setPair(e.target.value)}
              >
                {Object.entries(PAIR_TIMES).map(([num, [start, end]]) => (
                  <option key={num} value={num}>{num} пара ({start}–{end})</option>
                ))}
              </select>
            </div>
            {loading && (
              <div className="flex items-center self-end pb-2">
                <div className="w-5 h-5 lg:w-6 lg:h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
            <div>
              <h2 className="font-semibold text-sm lg:text-base text-green-600 dark:text-green-400 mb-2 lg:mb-3 flex items-center gap-2">
                <span className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-green-500"></span>
                Свободных: {freeRooms.length}
              </h2>
              <div className="space-y-1.5">
                {freeRooms.map(r => (
                  <div key={r.room_name} className="card py-2 lg:py-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400 shrink-0"></span>
                    <span className="text-sm lg:text-base font-medium">{r.room_name}</span>
                  </div>
                ))}
                {freeRooms.length === 0 && (
                  <p className="text-[var(--muted)] text-sm lg:text-base py-4 text-center">Свободных аудиторий нет</p>
                )}
              </div>
            </div>
            <div>
              <h2 className="font-semibold text-sm lg:text-base text-red-600 dark:text-red-400 mb-2 lg:mb-3 flex items-center gap-2">
                <span className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-red-500"></span>
                Занятых: {busyRooms.length}
              </h2>
              <div className="space-y-1.5">
                {busyRooms.map(r => (
                  <div key={r.room_name} className="card py-2 lg:py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0"></span>
                      <span className="text-sm lg:text-base font-medium">{r.room_name}</span>
                    </div>
                    {r.occupied_by && (
                      <p className="text-xs lg:text-sm text-[var(--muted)] mt-1 pl-4">{r.occupied_by}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
