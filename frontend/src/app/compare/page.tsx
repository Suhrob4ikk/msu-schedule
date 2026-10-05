"use client";
/**
 * «Сравнение групп» в стиле «Табло» (макеты sravnenie-*): та же сетка «дни ×
 * пары», что в Расписании, по строке на группу в ячейке и полоса окон, когда
 * свободны все. Своя группа — первая (цвет акцента), остальные — графит и
 * оранжевый; до трёх групп. На узком экране — один день с полосой дней.
 *
 * Адрес: /compare?with=ID,ID&week=YYYY-MM-DD (для ссылки). Выбор не пишется
 * в localStorage: своя группа не меняется.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Icon from "@/components/tablo/Icon";
import { Popover } from "@/components/tablo/Overlay";
import CompareGrid, { type CmpGroup } from "@/components/tablo/compare/CompareGrid";
import GroupPicker from "@/components/tablo/compare/GroupPicker";
import { api, shortGroupName, type Group, type Lesson } from "@/lib/api";
import { activeDays, everyone, freeWindows, slotMap, windowLabel, type SlotMap } from "@/lib/tablo/compare";
import { useLayout, useNow } from "@/lib/tablo/hooks";
import { mondayOf } from "@/lib/tablo/rooms";
import { addDays, isoOf, rangeLabel } from "@/lib/tablo/schedule";

const MAX_GROUPS = 3;
const DAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб"];

const label = (g: Group) => `${shortGroupName(g.name)} · ${g.year} курс`;

/** Неделя группы: week_id у каждой группы свой (привязан к факультету), ищем по week_start. */
async function loadWeek(g: Group, weekStart: string): Promise<Lesson[] | null> {
  const wks = await api.getGroupWeeks(g.id);
  const w = wks.find(x => x.week_start === weekStart);
  return w ? api.getGroupSchedule(g.id, undefined, w.id) : null;
}

export default function ComparePage() {
  const layout = useLayout();
  const now = useNow(30_000);
  const wide = layout === "wide" || layout === "xwide";

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsError, setGroupsError] = useState(false);
  const [myId, setMyId] = useState<number | null>(null);
  const [ids, setIds] = useState<Array<number | null>>([null, null]);
  const [weeksAll, setWeeksAll] = useState<Array<{ week_start: string; is_latest: boolean }> | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [data, setData] = useState<Record<number, Lesson[] | null>>({});
  const [loading, setLoading] = useState(false);
  const [hotKey, setHotKey] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [openEl, setOpenEl] = useState<HTMLElement | null>(null);

  const today = now ? isoOf(now) : "";
  const thisMonday = today ? mondayOf(today) : "";

  // ─── Старт: своя группа, группы из адреса, список недель ────────────────
  useEffect(() => {
    let my: number | null = null;
    try { my = Number(localStorage.getItem("selected_group_id")) || null; } catch { /* приватный режим */ }
    setMyId(my);
    const q = new URLSearchParams(window.location.search);
    const withIds = (q.get("with") ?? "").split(",").map(Number).filter(n => n > 0).slice(0, MAX_GROUPS);
    if (withIds.length) setIds(withIds.length > 1 ? withIds : [withIds[0], null]);
    else setIds([my, null]);
    const w = q.get("week");
    if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) setWeekStart(w);
    api.getAllWeeks().then(setWeeksAll).catch(() => setWeeksAll(null));
  }, []);

  const loadGroups = useCallback(() => {
    setGroupsError(false);
    api.getGroups().then(setGroups).catch(() => setGroupsError(true));
  }, []);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (weekStart || !thisMonday) return;
    setWeekStart(thisMonday);
  }, [weekStart, thisMonday]);

  const byId = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);
  const picked = ids.map(id => (id ? byId.get(id) ?? null : null));
  const chosen = picked.filter((g): g is Group => !!g);
  const idsKey = chosen.map(g => g.id).join(",");

  // Адрес держим в согласии с выбором
  useEffect(() => {
    if (!weekStart || !idsKey) return;
    window.history.replaceState(null, "", `/compare?with=${idsKey}&week=${weekStart}`);
  }, [idsKey, weekStart]);

  // ─── Расписание выбранных групп ─────────────────────────────────────────
  useEffect(() => {
    if (!weekStart || !chosen.length) return;
    let alive = true;
    setLoading(true);
    Promise.all(chosen.map(g => loadWeek(g, weekStart).then(ls => [g.id, ls] as const).catch(() => [g.id, undefined] as const)))
      .then(res => {
        if (!alive) return;
        const next: Record<number, Lesson[] | null> = {};
        for (const [id, ls] of res) if (ls !== undefined) next[id] = ls;
        setData(next);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // chosen собирается из ids и groups: ключ idsKey достаточен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, weekStart]);

  const ready = chosen.length >= 2 && chosen.every(g => g.id in data);
  const missingWeek = chosen.length >= 2 && !loading && chosen.some(g => g.id in data && data[g.id] === null);
  const cmp: CmpGroup[] = useMemo(
    () => chosen.filter(g => Array.isArray(data[g.id])).map(g => ({ id: g.id, label: label(g), map: slotMap(data[g.id] as Lesson[]) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, data],
  );
  const maps: SlotMap[] = cmp.map(c => c.map);
  const days = useMemo(() => activeDays(maps), [maps]);
  const windows = useMemo(() => freeWindows(maps), [maps]);

  // ─── Управление ─────────────────────────────────────────────────────────
  const setAt = (i: number, g: Group) => setIds(a => a.map((x, j) => (j === i ? g.id : x)));
  const swap = () => setIds(a => (a.length > 1 ? [a[1], a[0], ...a.slice(2)] : a));
  const addGroup = () => setIds(a => (a.length < MAX_GROUPS ? [...a, null] : a));
  const removeAt = (i: number) => { setIds(a => a.filter((_, j) => j !== i)); setOpen(null); };

  const weekChoices = useMemo(() => {
    if (!thisMonday) return [];
    return [thisMonday, addDays(thisMonday, 7)].map(ws => ({
      ws, enabled: weeksAll ? weeksAll.some(w => w.week_start === ws) : ws === thisMonday,
    }));
  }, [thisMonday, weeksAll]);
  const prevWeek = weekChoices.find(w => w.ws < (weekStart ?? "") && w.enabled);
  const nextWeek = weekChoices.find(w => w.ws > (weekStart ?? "") && w.enabled);
  const goWeek = (ws: string) => { setWeekStart(ws); setHotKey(null); };

  const needMine = !myId && !chosen.length;

  const strip = ready && windows.length > 0 && (
    <div className="t-cg-strip">
      <strong>{everyone(cmp.length)}</strong>
      <div role="group" aria-label="Окна">
        {windows.map(w => (
          <button key={w.key} type="button" aria-pressed={hotKey === w.key}
            className={`t-cg-chip ${hotKey === w.key ? "t-cg-chip-on" : ""}`}
            onClick={() => setHotKey(k => (k === w.key ? null : w.key))}>
            {DAY_SHORT[w.dayIndex]} · {windowLabel(w)}
          </button>
        ))}
      </div>
      {wide && <em>нажмите на окно дня, чтобы выделить его</em>}
    </div>
  );

  return (
    <div className="t-page">
      <Header />
      <main className={`t-main ${layout ? `t-main-${layout}` : ""}`}>
        {layout === null ? null : (
          <>
            <div className="t-cg-bar">
              {ids.map((id, i) => {
                const g = picked[i];
                return (
                  <div key={i} className="t-cg-sel">
                    {i === 1 && (
                      <button type="button" className="t-icon-btn t-cg-swap" onClick={swap} aria-label="Поменять группы местами">
                        <Icon name="swap" size={22} />
                      </button>
                    )}
                    <button type="button"
                      className={`t-cg-pick ${open === i ? "t-cg-pick-on" : ""}`} aria-haspopup="dialog" aria-expanded={open === i}
                      onClick={e => { setOpenEl(e.currentTarget); setOpen(o => (o === i ? null : i)); }}>
                      <i className={`t-cg-mark t-cg-m${i} t-cg-on`} aria-hidden="true" />
                      <b>{g ? label(g) : "Выберите группу"}</b>
                      {g && id === myId && <small>моя</small>}
                      <Icon name="chevronDown" size={18} />
                    </button>
                  </div>
                );
              })}
              {ids.length < MAX_GROUPS && (
                <button type="button" className="t-cg-add" onClick={addGroup}>+ ещё группа</button>
              )}
              <div className="t-cg-week" role="group" aria-label="Неделя">
                <button type="button" disabled={!prevWeek} onClick={() => prevWeek && goWeek(prevWeek.ws)} aria-label="Предыдущая неделя">
                  <Icon name="chevronLeft" size={20} />
                </button>
                <span>{weekStart ? rangeLabel(weekStart, addDays(weekStart, 5)) : ""}</span>
                <button type="button" disabled={!nextWeek} onClick={() => nextWeek && goWeek(nextWeek.ws)} aria-label="Следующая неделя">
                  <Icon name="chevronRight" size={20} />
                </button>
              </div>
            </div>

            {groupsError && !groups.length ? (
              <div className="t-state">
                <Icon name="wifiOff" size={40} />
                <h2>Нет связи с сервером</h2>
                <button type="button" className="t-btn-fill" onClick={loadGroups}>Повторить</button>
              </div>
            ) : needMine || chosen.length < 2 ? (
              <div className="t-state">
                <Icon name="swap" size={40} />
                <h2>Выберите две группы</h2>
                <p>{needMine ? "Свою группу можно указать в кабинете, или выберите обе здесь." : "Выберите вторую группу, чтобы увидеть общие окна."}</p>
              </div>
            ) : missingWeek ? (
              <div className="t-state">
                <Icon name="calendar" size={40} />
                <h2>Этой недели нет у одной из групп</h2>
                <p>Расписание ещё не вышло для всех выбранных групп.</p>
              </div>
            ) : !ready ? (
              <div className="t-skel t-skel-block" style={{ height: 420 }} aria-busy="true" />
            ) : days.length === 0 ? (
              <div className="t-state">
                <Icon name="calendar" size={40} />
                <h2>Пар нет</h2>
                <p>На этой неделе занятий нет ни у одной из групп.</p>
              </div>
            ) : (
              <>
                {strip}
                {wide && cmp.length > 0 && (
                  <div className="t-cg-legend">
                    {cmp.map((c, i) => (
                      <span key={c.id}><i className={`t-cg-mark t-cg-m${i} t-cg-on`} aria-hidden="true" />{c.label}</span>
                    ))}
                  </div>
                )}
                <CompareGrid
                  groups={cmp}
                  weekStart={weekStart!}
                  now={now}
                  activeDays={days}
                  windows={windows}
                  hotKey={hotKey}
                  single={!wide}
                />
              </>
            )}
          </>
        )}
      </main>

      {open !== null && (
        <Popover anchor={openEl} onClose={() => setOpen(null)} width={400} label="Выбор группы">
          <div className="t-panel">
            <GroupPicker
              groups={groups}
              value={picked[open]}
              onPick={g => { setAt(open, g); setHotKey(null); }}
              onRemove={open >= 2 ? () => removeAt(open) : undefined}
            />
          </div>
        </Popover>
      )}
    </div>
  );
}
