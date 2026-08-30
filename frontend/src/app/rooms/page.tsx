"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import WeekBar from "@/components/WeekBar";
import { SkeletonRooms } from "@/components/Skeletons";
import { api, DAYS_ORDER, PAIR_TIMES, currentSlot } from "@/lib/api";

const DAY_SHORT: Record<string, string> = {
  понедельник: "Пн", вторник: "Вт", среда: "Ср",
  четверг: "Чт", пятница: "Пт", суббота: "Сб",
};

const DAY_OFFSET: Record<string, number> = {
  понедельник: 0, вторник: 1, среда: 2, четверг: 3, пятница: 4, суббота: 5,
};

const DAYS = DAYS_ORDER.filter(d => d !== "воскресенье");

function getDayDate(dayName: string, weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + (DAY_OFFSET[dayName] ?? 0));
  return d.getDate().toString();
}

export default function RoomsPage() {
  const [day, setDay] = useState("понедельник");
  // После монтирования — сегодняшний день (вс → понедельник). В useEffect,
  // чтобы первый клиентский рендер совпадал с SSR (иначе hydration #418).
  const [pair, setPair] = useState("I");
  useEffect(() => {
    // Переход из расписания по клику на аудиторию: ?day=вторник&pair=II.
    // Адрес читаем после монтирования, а не через useSearchParams — иначе
    // страница перестала бы собираться статически и потребовала Suspense.
    const q = new URLSearchParams(window.location.search);
    const qDay = q.get("day");
    const qPair = q.get("pair");
    if (qDay && DAYS.includes(qDay)) {
      setDay(qDay);
      if (qPair && PAIR_TIMES[qPair]) setPair(qPair);
      return;
    }
    const jsDay = new Date().getDay();
    if (jsDay >= 1 && jsDay <= 6) setDay(DAYS_ORDER[jsDay - 1]);
  }, []);
  const [rooms, setRooms] = useState<Array<{
    room_name: string; is_free: boolean; occupied_by?: string;
    occupied_list?: string[]; conflict?: boolean;
  }>>([]);
  const [loading, setLoading] = useState(false);
  // «Свободно сейчас» нажали вечером или в воскресенье — показываем пояснение
  const [noSlotHint, setNoSlotHint] = useState(false);
  const [weekBarReady, setWeekBarReady] = useState(false);
  // Пусто на старте (совпадает с SSR), реальную неделю выставит WeekBar после
  // монтирования — иначе первый клиентский рендер расходится с сервером (#418).
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");

  // Полоса недель не смогла назвать неделю (нет сети или база ещё пуста после
  // деплоя) — грузим без week_start, бэкенд отдаст последнюю. Без этого экран
  // навсегда оставался бы на скелетоне: запрос не уходил вообще.
  const [weeksUnknown, setWeeksUnknown] = useState(false);
  /** Запрос упал: «нет связи» и «данных нет» — разные сообщения. */
  const [loadError, setLoadError] = useState(false);
  /** Счётчик для кнопки «Повторить»: меняется — эффект перезапускается. */
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!selectedWeekStart && !weeksUnknown) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    api.getFreeRooms(day, pair, selectedWeekStart || undefined)
      .then(result => { if (!cancelled) setRooms(result); })
      // Без catch отказ уходил в unhandled rejection, а на экране оставался
      // прошлый список — теперь честно показываем, что связи нет.
      .catch(() => { if (!cancelled) { setRooms([]); setLoadError(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [day, pair, selectedWeekStart, weeksUnknown, retryTick]);

  const handleWeekChange = (weekStart: string) => {
    setSelectedWeekStart(weekStart);
    setWeekBarReady(true);
  };

  const handleNoWeeks = useCallback(() => {
    setWeeksUnknown(true);
    setWeekBarReady(true);
  }, []);

  const freeRooms = rooms.filter(r => r.is_free);
  const busyRooms = rooms.filter(r => !r.is_free);

  return (
    <div className="min-h-screen">
      <Header />
      <WeekBar onWeekChange={handleWeekChange} selectedWeekStart={selectedWeekStart} onUnavailable={handleNoWeeks} />
      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">

        {/* Фильтры */}
        <div className="card mb-4 lg:mb-5">
          <h1 className="font-bold text-lg lg:text-2xl mb-3">Свободные аудитории</h1>

          {/* Быстрый переход к текущей паре — самый частый вопрос «где сейчас свободно» */}
          <button
            onClick={() => {
              const slot = currentSlot();
              if (!slot) { setNoSlotHint(true); return; }
              setNoSlotHint(false);
              setDay(slot.day);
              setPair(slot.pair);
            }}
            className="w-full mb-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--primary)" }}
          >
            Свободно прямо сейчас
          </button>
          {noSlotHint && (
            <p className="text-xs text-[var(--muted)] -mt-2 mb-4">
              Сейчас занятий нет — вечер или выходной. Выбери день и пару вручную.
            </p>
          )}

          {/* День */}
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">День</p>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
            {DAYS.map(d => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={`shrink-0 flex flex-col items-center px-4 py-2 rounded-xl border transition-colors ${
                  day === d
                    ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                    : "bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]"
                }`}
              >
                <span className="text-sm font-bold">{DAY_SHORT[d]}</span>
                {selectedWeekStart && (
                  <span className={`text-xs leading-tight ${day === d ? "text-white/70" : "text-[var(--muted)]"}`}>
                    {getDayDate(d, selectedWeekStart)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Пара */}
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Пара</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {Object.entries(PAIR_TIMES).map(([num, [start]]) => (
              <button
                key={num}
                onClick={() => setPair(num)}
                className={`shrink-0 flex flex-col items-center px-4 py-2 rounded-xl border transition-colors ${
                  pair === num
                    ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                    : "bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]"
                }`}
              >
                <span className="text-sm font-bold">{num}</span>
                <span className={`text-xs ${pair === num ? "text-white/75" : "text-[var(--muted)]"}`}>{start}</span>
              </button>
            ))}
            {loading && (
              <div className="flex items-center px-2">
                <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* Свободные — компактные чипы */}
            <div>
              <h2 className="font-semibold text-base lg:text-lg text-green-600 dark:text-green-400 mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0"></span>
                Свободных: {freeRooms.length}
              </h2>
              {freeRooms.length === 0 ? (
                <p className="text-[var(--muted)] text-sm py-2">Нет свободных аудиторий</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {freeRooms.map(r => (
                    <span
                      key={r.room_name}
                      className="px-2.5 py-1 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-sm font-semibold text-green-700 dark:text-green-400"
                    >
                      {r.room_name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Занятые */}
            <div>
              <h2 className="font-semibold text-base lg:text-lg text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></span>
                Занятых: {busyRooms.length}
              </h2>
              <div className="space-y-2">
                {busyRooms.map(r => {
                  const entries = r.occupied_list ?? (r.occupied_by ? [r.occupied_by] : []);
                  return (
                    <div key={r.room_name} className="rounded-xl border-l-[3px] border-l-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{r.room_name}</span>
                        {r.conflict && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white">
                            {entries.length} группы одновременно
                          </span>
                        )}
                      </div>
                      {entries.map((e, i) => (
                        <p key={i} className="text-xs text-[var(--muted)] mt-0.5">{e}</p>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {rooms.length === 0 && (!weekBarReady || loading) && <SkeletonRooms />}

        {!loading && rooms.length === 0 && weekBarReady && (
          <div className="text-center py-16 text-[var(--muted)]">
            {loadError ? (
              <>
                <p>Нет связи с сервером</p>
                <button
                  onClick={() => setRetryTick(t => t + 1)}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                  style={{ background: "var(--primary)" }}
                >
                  Повторить
                </button>
              </>
            ) : (
              <p>Данных нет для выбранной недели</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
