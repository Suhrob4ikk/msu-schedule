"use client";
/**
 * Вкладка «Аудитории» в стиле «Табло» (макеты auditorii-1…5).
 *
 * Сверху панель: «Когда» (ближайшая пара или выбранные неделя/день/пара), соседняя
 * пара ‹ ›, поиск по номеру, фильтр «Все / Свободны / Заняты». Ниже плитки
 * свободных и занятых; подробности аудитории — справа (от 1024) или в шторке.
 *
 * Всё считается на клиенте из пяти ответов /schedule/free-rooms (по одному на
 * пару) — как во вкладке приложения, lib/tablo/rooms.ts. Бэкенд не менялся.
 * Адрес: /rooms?day=вторник&pair=II&room=104&week=YYYY-MM-DD (ссылки из «Расписания»).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import Icon from "@/components/tablo/Icon";
import { Popover, Sheet } from "@/components/tablo/Overlay";
import RoomDetails, { type Links } from "@/components/tablo/rooms/RoomDetails";
import WhenPanel, { weekLabelFor } from "@/components/tablo/rooms/WhenPanel";
import { api, DAYS_ORDER, PAIR_TIMES, shortGroupName, type Group, type Teacher } from "@/lib/api";
import { useLayout, useNow } from "@/lib/tablo/hooks";
import {
  buildDay, displayRoom, headerSubtitle, mondayOf, nowSlot, PAIRS, roomStatus, rowA11y,
  searchRooms, type NowSlot, type RoomSlot, type Slot,
} from "@/lib/tablo/rooms";
import { addDays, dayTitle, isoOf } from "@/lib/tablo/schedule";

type Filter = "all" | "free" | "busy";
const DAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб"];

function makeSlot(weekStart: string, dayIndex: number, pair: string): Slot {
  return { date: addDays(weekStart, dayIndex), weekStart, dayIndex, pair };
}

/** Соседняя пара по порядку недели (пн I … сб V); null — край недели. */
function stepSlot(s: Slot, dir: -1 | 1): Slot | null {
  const n = s.dayIndex * PAIRS.length + PAIRS.indexOf(s.pair) + dir;
  if (n < 0 || n >= 6 * PAIRS.length) return null;
  return makeSlot(s.weekStart, Math.floor(n / PAIRS.length), PAIRS[n % PAIRS.length]);
}

export default function RoomsPage() {
  const layout = useLayout();
  const now = useNow(30_000);
  const wide = layout === "wide" || layout === "xwide";
  const phone = layout === "phone";

  const [manual, setManual] = useState<Slot | null>(null);
  const [weeksAll, setWeeksAll] = useState<Array<{ week_start: string; is_latest: boolean }> | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [data, setData] = useState<{ key: string; byPair: Record<string, RoomSlot[]> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selRoom, setSelRoom] = useState<string | null>(null);
  // Пара, которую человек выбрал в подробностях аудитории. Меняет только сами
  // подробности — плитки слева остаются на паре из «Когда».
  const [detailPair, setDetailPair] = useState<number | null>(null);
  const [whenOpen, setWhenOpen] = useState(false);
  const [whenBtn, setWhenBtn] = useState<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const nowS: NowSlot | null = useMemo(() => (now ? nowSlot(now) : null), [now]);
  const slot: Slot | null = manual ?? nowS;
  const pairIdx = slot ? PAIRS.indexOf(slot.pair) : 0;
  const today = now ? isoOf(now) : "";
  const thisMonday = today ? mondayOf(today) : "";

  // ─── Данные ──────────────────────────────────────────────────────────────
  useEffect(() => {
    api.getAllWeeks().then(setWeeksAll).catch(() => {});
    api.getGroups().then(setGroups).catch(() => {});
  }, []);

  const weekStart = slot?.weekStart ?? null;
  useEffect(() => {
    if (!weekStart) return;
    let alive = true;
    api.getTeachers(weekStart).then(t => { if (alive) setTeachers(t); }).catch(() => {});
    return () => { alive = false; };
  }, [weekStart]);

  const dataKey = slot ? `${slot.weekStart}|${slot.dayIndex}` : null;
  useEffect(() => {
    if (!slot || !dataKey) return;
    let alive = true;
    const day = DAYS_ORDER[slot.dayIndex];
    setFailed(false);
    Promise.all(PAIRS.map(p => api.getFreeRooms(day, p, slot.weekStart).catch(() => null))).then(list => {
      if (!alive) return;
      if (list.every(x => !x)) { setFailed(true); return; }
      const byPair: Record<string, RoomSlot[]> = {};
      PAIRS.forEach((p, i) => { byPair[p] = list[i] ?? []; });
      setData({ key: dataKey, byPair });
    });
    return () => { alive = false; };
    // slot пересчитывается каждые 30 с, а запрашивать нужно только при смене дня/недели
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, retry]);

  // Адрес → выбор (один раз, когда известно «сейчас»)
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (booted || !now) return;
    setBooted(true);
    const q = new URLSearchParams(window.location.search);
    const day = q.get("day");
    const pair = q.get("pair");
    const room = q.get("room");
    const week = q.get("week");
    if (room) setSelRoom(room);
    const di = day ? DAYS_ORDER.indexOf(day) : -1;
    if (di >= 0 && di <= 5) {
      const ws = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : mondayOf(isoOf(now));
      setManual(makeSlot(ws, di, pair && PAIRS.includes(pair) ? pair : PAIRS[0]));
    }
  }, [booted, now]);

  const rooms = useMemo(
    () => (data && dataKey && data.key === dataKey ? buildDay(data.byPair) : null),
    [data, dataKey],
  );

  const view = useMemo(() => {
    if (!rooms) return null;
    const free = rooms.filter(d => !d.occupants[pairIdx].length);
    const busy = rooms.filter(d => d.occupants[pairIdx].length);
    return { free, busy, total: rooms.length };
  }, [rooms, pairIdx]);

  // Поиск: подходящие плитки остаются, остальные бледнеют (сетка не прыгает)
  const hits = useMemo(() => {
    if (!rooms) return null;
    const r = searchRooms(rooms.map(d => d.room), query);
    return r ? new Set([...(r.exact ? [r.exact] : []), ...r.others]) : null;
  }, [rooms, query]);

  const selDay = rooms?.find(d => d.room === selRoom) ?? null;
  const slotKey = slot ? `${slot.weekStart}|${slot.dayIndex}|${slot.pair}` : "";
  // Другая аудитория или другое время сверху — подробности снова на выбранной паре
  useEffect(() => { setDetailPair(null); }, [selRoom, slotKey]);
  const detailIdx = detailPair ?? pairIdx;

  // ─── Выбор времени ───────────────────────────────────────────────────────
  const pick = useCallback((s: Slot) => setManual(s), []);
  const goNow = () => { setManual(null); setWhenOpen(false); };
  const step = (dir: -1 | 1) => { if (slot) { const n = stepSlot(slot, dir); if (n) pick(n); } };

  const weekChoices = useMemo(() => {
    if (!thisMonday) return [];
    return [thisMonday, addDays(thisMonday, 7)].map(ws => ({
      weekStart: ws,
      label: weekLabelFor(ws, thisMonday),
      enabled: weeksAll ? weeksAll.some(w => w.week_start === ws) : ws === thisMonday,
    }));
  }, [thisMonday, weeksAll]);

  // ─── Клавиши ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setQuery(""); return; }
    if (e.key !== "Enter" || !rooms) return;
    const r = searchRooms(rooms.map(d => d.room), query);
    const first = r?.exact ?? r?.others[0];
    if (first) setSelRoom(first);
  };

  // ─── Ссылки в подробностях ───────────────────────────────────────────────
  const links: Links = useMemo(() => ({
    group: o => {
      if (o.course == null) return null;
      const g = groups.find(x => x.year === o.course && shortGroupName(x.name) === o.program);
      return g && slot ? `/?group=${g.id}&week=${slot.weekStart}` : null;
    },
    teacher: name => {
      const t = teachers.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase());
      return t && slot ? `/teachers?teacher=${t.id}&week=${slot.weekStart}` : null;
    },
  }), [groups, teachers, slot]);

  // ─── Подписи ─────────────────────────────────────────────────────────────
  const sub = slot ? (() => {
    if (!manual && nowS) {
      const h = headerSubtitle(nowS, nowS, now ?? new Date());
      return nowS.kind === "nearest" ? { lead: h.lead, rest: ` · ${dayTitle(nowS.date).toLowerCase()}` } : h;
    }
    return { lead: null, rest: dayTitle(slot.date) };
  })() : null;
  const pairLine = slot ? `${slot.pair} пара · ${PAIR_TIMES[slot.pair][0]}–${PAIR_TIMES[slot.pair][1]}` : "";
  const nowLabel = nowS ? `Ближайшая пара · ${DAY_SHORT[nowS.dayIndex]}, ${nowS.pair}` : "Ближайшая пара";
  const prevOk = !!slot && !!stepSlot(slot, -1);
  const nextOk = !!slot && !!stepSlot(slot, 1);

  const counts = { all: view?.total ?? 0, free: view?.free.length ?? 0, busy: view?.busy.length ?? 0 };

  // ─── Плитки ──────────────────────────────────────────────────────────────
  const tile = (d: ReturnType<typeof buildDay>[number]) => {
    const st = roomStatus(d, pairIdx);
    const name = displayRoom(d.room);
    const text = st.free ? (st.until ? `до ${st.until}` : "весь день") : `до ${st.until}`;
    const dim = hits && !hits.has(d.room);
    return (
      <button
        key={d.room}
        type="button"
        onClick={() => setSelRoom(d.room)}
        aria-pressed={selRoom === d.room}
        aria-label={rowA11y(d, pairIdx)}
        className={`t-rm ${st.free ? "t-rm-free" : "t-rm-busy"} ${selRoom === d.room ? "t-rm-on" : ""} ${dim ? "t-rm-dim" : ""}`}
      >
        <b className={name.length > 5 ? "t-rm-long" : ""}>{name}</b>
        <span>{text}</span>
      </button>
    );
  };

  const grid = (list: ReturnType<typeof buildDay>) => (
    <div className="t-rm-grid">{list.map(tile)}</div>
  );

  const details = selDay && slot ? (
    <RoomDetails
      day={selDay}
      slot={slot}
      pairIdx={detailIdx}
      links={links}
      onPair={setDetailPair}
      onClose={() => setSelRoom(null)}
      bare={!wide}
    />
  ) : null;

  // ─── Рендер ──────────────────────────────────────────────────────────────
  const body = failed && !rooms ? (
    <div className="t-state">
      <Icon name="wifiOff" size={40} />
      <h2>Нет связи с сервером</h2>
      <button type="button" className="t-btn-fill" onClick={() => setRetry(n => n + 1)}>Повторить</button>
    </div>
  ) : !view ? (
    <div className="t-rm-grid" aria-busy="true">
      {Array.from({ length: 14 }, (_, i) => <span key={i} className="t-rm t-skel" />)}
    </div>
  ) : view.total === 0 ? (
    <div className="t-state">
      <Icon name="door" size={40} />
      <h2>Данных на эту неделю нет</h2>
      <p>Расписание ещё не вышло.</p>
    </div>
  ) : (
    <>
      {filter !== "busy" && (
        <section aria-label="Свободные аудитории">
          <div className="t-rm-head t-rm-head-free">
            <h2>Свободны · {view.free.length}</h2>
            <span>из {view.total}</span>
          </div>
          {view.free.length ? grid(view.free) : <p className="t-rm-none">Свободных аудиторий нет</p>}
        </section>
      )}
      {filter !== "free" && (
        <section aria-label="Занятые аудитории">
          <div className="t-rm-head t-rm-head-busy">
            <h2>Заняты · {view.busy.length}</h2>
            <span>нажмите, чтобы узнать, кто</span>
          </div>
          {view.busy.length ? grid(view.busy) : <p className="t-rm-none">Все аудитории свободны</p>}
        </section>
      )}
    </>
  );

  return (
    <div className="t-page">
      <Header />
      <main className={`t-main ${layout ? `t-main-${layout}` : ""}`}>
        {layout === null || !slot ? null : (
          <>
            <div className="t-rm-bar">
              <button ref={setWhenBtn} type="button" className={`t-rm-when ${whenOpen ? "t-rm-when-on" : ""}`}
                aria-haspopup="dialog" aria-expanded={whenOpen} onClick={() => setWhenOpen(o => !o)}>
                <span>
                  <small>
                    {sub?.lead && <b>{sub.lead}</b>}
                    {sub?.rest}
                  </small>
                  <strong>{pairLine}</strong>
                </span>
                <Icon name="chevronDown" size={20} />
              </button>

              <div className="t-rm-step" onKeyDown={e => {
                if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
                if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
              }}>
                <button type="button" onClick={() => step(-1)} disabled={!prevOk} aria-label="Предыдущая пара">
                  <Icon name="chevronLeft" size={20} />
                </button>
                <span>пара</span>
                <button type="button" onClick={() => step(1)} disabled={!nextOk} aria-label="Следующая пара">
                  <Icon name="chevronRight" size={20} />
                </button>
              </div>

              <label className="t-rm-search">
                <Icon name="search" size={20} />
                <input ref={searchRef} type="search" inputMode="numeric" placeholder={phone ? "Номер" : "Номер аудитории"} value={query}
                  onChange={e => setQuery(e.target.value)} onKeyDown={onSearchKey} aria-label="Номер аудитории" />
                {wide && !query && <kbd className="t-kbd">/</kbd>}
                {query && (
                  <button type="button" className="t-tsearch-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Очистить поиск">
                    <Icon name="close" size={18} />
                  </button>
                )}
              </label>

              <div className="t-seg t-rm-filter" role="radiogroup" aria-label="Фильтр">
                {([["all", "Все"], ["free", "Свободны"], ["busy", "Заняты"]] as const).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={filter === k}
                    className={`t-seg-btn ${filter === k ? "t-seg-on" : ""}`} onClick={() => setFilter(k)}>
                    {label} · {counts[k]}
                  </button>
                ))}
              </div>
            </div>

            <div className={wide ? "t-rm-layout" : ""}>
              <div className="min-w-0 t-rm-body">{body}</div>
              {wide && (
                <aside className="t-rm-side" aria-label="Подробности аудитории">
                  {details ?? (
                    <div className="t-rm-empty">
                      <Icon name="door" size={36} />
                      <p>Выберите аудиторию, чтобы увидеть, кто в ней занимается и как она занята в течение дня</p>
                    </div>
                  )}
                </aside>
              )}
            </div>
          </>
        )}
      </main>

      {whenOpen && slot && (
        <Popover anchor={whenBtn} onClose={() => setWhenOpen(false)} width={440} label="Когда">
          <div className="t-panel">
            <WhenPanel
              slot={slot}
              isNow={!manual}
              nowLabel={nowLabel}
              today={today}
              weeks={weekChoices}
              onNow={goNow}
              onWeek={ws => pick(makeSlot(ws, slot.dayIndex, slot.pair))}
              onDay={i => pick(makeSlot(slot.weekStart, i, slot.pair))}
              onPair={i => { pick(makeSlot(slot.weekStart, slot.dayIndex, PAIRS[i])); setWhenOpen(false); }}
              onClose={() => setWhenOpen(false)}
            />
          </div>
        </Popover>
      )}

      {!wide && selDay && details && (
        <Sheet onClose={() => setSelRoom(null)} label={`Аудитория ${displayRoom(selDay.room)}`}
          title={`Аудитория ${displayRoom(selDay.room)}`}>
          <div className="px-4 pb-2">{details}</div>
        </Sheet>
      )}
    </div>
  );
}
