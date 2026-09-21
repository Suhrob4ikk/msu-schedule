"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import WeekBar from "@/components/WeekBar";
import Sheet from "@/components/Sheet";
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

/**
 * Бэкенд отдаёт запись занятости одной строкой вида
 * «3 курс · ПМиИ: Кураторский час · Практика · Бобоев Ш.А.» (см.
 * schedule.py, entry = f"{год} курс · {группа}: {предмет}{тип}{препод}»).
 * Разбираем на «группа: предмет» и «тип · препод» — как две строки в карточке,
 * а не переписываем формат на бэкенде ради одного экрана.
 */
function splitOccupantEntry(entry: string): { top: string; bottom: string } {
  const sep = entry.indexOf(": ");
  if (sep === -1) return { top: entry, bottom: "" };
  const group = entry.slice(0, sep);
  const rest = entry.slice(sep + 2).split(" · ");
  const subject = rest[0] ?? "";
  return { top: `${group}: ${subject}`, bottom: rest.slice(1).join(" · ") };
}

/**
 * Порядок аудиторий: числовые по возрастанию номера (100, 104, 208, 301…),
 * именованные — после них по алфавиту («лабгеол», «лабфиз», «стадион»).
 * Обычная строковая сортировка ставила бы «105» перед «99», а буквенные
 * названия вперемешку с числами.
 */
function byRoomNumber(a: { room_name: string }, b: { room_name: string }): number {
  const na = parseInt(a.room_name, 10);
  const nb = parseInt(b.room_name, 10);
  const aIsNum = !Number.isNaN(na);
  const bIsNum = !Number.isNaN(nb);
  if (aIsNum && bIsNum) return na - nb || a.room_name.localeCompare(b.room_name, "ru");
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  return a.room_name.localeCompare(b.room_name, "ru");
}

export default function RoomsPage() {
  const [day, setDay] = useState("понедельник");
  // После монтирования — сегодняшний день (вс → понедельник). В useEffect,
  // чтобы первый клиентский рендер совпадал с SSR (иначе hydration #418).
  const [pair, setPair] = useState("I");
  // Подсветка кнопки «Свободно прямо сейчас»: активна, только если день/пару
  // не трогали руками после неё. Ручной выбор дня/пары эту подсветку снимает.
  const [isNowSlot, setIsNowSlot] = useState(false);
  // Аудитория, по которой открыта карточка с подробностями. Раньше здесь была
  // кнопка «Подробнее», разворачивавшая сразу ВЕСЬ список занятых — экран
  // превращался в простыню, и всё равно приходилось искать глазами нужную.
  // Теперь подробности открываются по клику на конкретную аудиторию.
  const [openRoom, setOpenRoom] = useState<string | null>(null);
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
    free_until?: string | null; occupied_until?: string | null;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
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

  const searchedRooms = search.trim()
    ? rooms.filter(r => r.room_name.toLowerCase().includes(search.trim().toLowerCase()))
    : rooms;
  // Внутри каждого списка — по номеру аудитории, а не по времени освобождения:
  // глазами ищут «где 302», а не «что освободится раньше». Бэкенд отдаёт занятые
  // отсортированными по времени, поэтому пересортировываем здесь.
  const freeRooms = searchedRooms.filter(r => r.is_free).sort(byRoomNumber);
  const busyRooms = searchedRooms.filter(r => !r.is_free).sort(byRoomNumber);

  return (
    <div className="min-h-screen">
      <Header />
      <WeekBar onWeekChange={handleWeekChange} selectedWeekStart={selectedWeekStart} onUnavailable={handleNoWeeks} />
      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-6">

        {/* Фильтры */}
        <div className="card mb-4 lg:mb-5">
          <h1 className="font-bold text-lg lg:text-2xl mb-3">Свободные аудитории</h1>

          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
            <div>
              <div className="relative mb-4">
                <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                  type="search"
                  placeholder="Найти аудиторию, например 105..."
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] pl-10 pr-3 py-2 lg:py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* Быстрый переход к текущей паре — самый частый вопрос «где сейчас свободно».
                  Подсвечена, только пока действительно показан текущий слот — выбор дня/пары
                  руками подсветку снимает, иначе кнопка врала бы, что всё ещё «сейчас». */}
              <button
                onClick={() => {
                  const slot = currentSlot();
                  if (!slot) { setNoSlotHint(true); return; }
                  setNoSlotHint(false);
                  setIsNowSlot(true);
                  setDay(slot.day);
                  setPair(slot.pair);
                }}
                className={`w-full max-w-sm mb-4 min-h-[48px] rounded-full text-sm font-bold transition-all active:scale-95 ${
                  isNowSlot
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)]"
                }`}
              >
                Свободно прямо сейчас
              </button>
              {noSlotHint && (
                <p className="text-xs text-[var(--muted)] -mt-2 mb-4">
                  Сейчас занятий нет — вечер или выходной. Выбери день и пару вручную.
                </p>
              )}
            </div>

            <div>
              {/* День */}
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">День</p>
              <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
                {DAYS.map(d => (
                  <button
                    key={d}
                    onClick={() => { setDay(d); setIsNowSlot(false); }}
                    className={`shrink-0 flex flex-col items-center px-4 py-2 rounded-2xl border transition-colors ${
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
                    onClick={() => { setPair(num); setIsNowSlot(false); }}
                    className={`shrink-0 flex flex-col items-center px-4 py-2 rounded-2xl border transition-colors ${
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
                <div className="flex flex-wrap gap-2">
                  {freeRooms.map(r => (
                    <button
                      key={r.room_name}
                      onClick={() => setOpenRoom(r.room_name)}
                      className="flex flex-col items-center min-w-[64px] px-3 py-1.5 rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 transition-all active:scale-95 hover:border-green-500"
                    >
                      <span className="text-sm font-bold text-green-700 dark:text-green-400 leading-tight">{r.room_name}</span>
                      <span className="text-[10px] text-green-700/70 dark:text-green-400/70 leading-tight">
                        {r.free_until ? `до ${r.free_until}` : "весь день"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Занятые */}
            <div>
              <h2 className="font-semibold text-base lg:text-lg text-red-600 dark:text-red-400 flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></span>
                Занятых: {busyRooms.length}
                <span className="ml-auto text-xs font-normal text-[var(--muted)]">нажми, чтобы узнать кто</span>
              </h2>

              <div className="flex flex-wrap gap-2">
                {busyRooms.map(r => (
                  <button
                    key={r.room_name}
                    onClick={() => setOpenRoom(r.room_name)}
                    className="relative flex flex-col items-center min-w-[64px] px-3 py-1.5 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 transition-all active:scale-95 hover:border-red-500"
                  >
                    <span className="text-sm font-bold text-red-700 dark:text-red-400 leading-tight">{r.room_name}</span>
                    {r.occupied_until && (
                      <span className="text-[10px] text-red-700/70 dark:text-red-400/70 leading-tight">до {r.occupied_until}</span>
                    )}
                    {/* Накладка в расписании университета — отмечаем точкой прямо на чипе */}
                    {r.conflict && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-[var(--background)]" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {rooms.length === 0 && (!weekBarReady || loading) && <SkeletonRooms />}

        {/* Подробности по конкретной аудитории — по клику на неё.
            Шторка снизу на телефоне, окно по центру на широком экране. */}
        {openRoom && (() => {
          const r = rooms.find(x => x.room_name === openRoom);
          if (!r) return null;
          const entries = r.occupied_list ?? (r.occupied_by ? [r.occupied_by] : []);
          const [pairStart, pairEnd] = PAIR_TIMES[pair] ?? ["", ""];
          return (
            <Sheet
              title={`Аудитория ${r.room_name}`}
              subtitle={`${day.charAt(0).toUpperCase()}${day.slice(1)} · ${pair} пара · ${pairStart}–${pairEnd}`}
              onClose={() => setOpenRoom(null)}
            >
              {r.is_free ? (
                <>
                  <div className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-green-50 dark:bg-green-950/30">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      Свободна {r.free_until ? `до ${r.free_until}` : "весь день"}
                    </span>
                  </div>
                  <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                    {r.free_until
                      ? `После ${r.free_until} аудиторию занимает следующая пара.`
                      : "До конца дня занятий в этой аудитории нет."}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-red-50 dark:bg-red-950/30">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    <span className="font-semibold text-red-700 dark:text-red-400">
                      Занята {r.occupied_until ? `до ${r.occupied_until}` : ""}
                    </span>
                  </div>

                  {r.conflict && (
                    <p className="mt-3 text-xs font-bold px-3 py-2 rounded-xl bg-red-500 text-white">
                      В расписании накладка: {entries.length} группы в одной аудитории одновременно
                    </p>
                  )}

                  <div className="mt-3 space-y-2">
                    {entries.map((e, i) => {
                      const { top, bottom } = splitOccupantEntry(e);
                      return (
                        <div key={i} className="rounded-2xl px-4 py-3" style={{ background: "var(--tag-bg)" }}>
                          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{top}</p>
                          {bottom && <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{bottom}</p>}
                        </div>
                      );
                    })}
                  </div>

                  {r.occupied_until && (
                    <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                      Освободится в {r.occupied_until}. Это время считается по всем парам подряд —
                      занимать аудиторию до него может не одна группа, а несколько.
                    </p>
                  )}
                </>
              )}
            </Sheet>
          );
        })()}

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
