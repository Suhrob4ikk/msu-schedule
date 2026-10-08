"use client";
/**
 * Вкладка «Педагоги» в стиле «Табло» (макеты pedagogi-wide; на узком экране —
 * как в приложении, ТЗ «Педагоги»).
 *
 * От 1024 px — список слева (своя прокрутка, полоса букв) и неделя педагога
 * справа; «Таблица» — только от 1280. Уже 1024 — сначала список, по нажатию
 * экран педагога (кнопка «Назад» браузера возвращает к списку).
 *
 * Список — педагоги этой и следующей недели. Статус под ФИО («Сейчас · ауд. 702»)
 * считается на клиенте из /schedule/bulk-sync — без сети статусов нет.
 * Адрес: /teachers?teacher=ID&week=YYYY-MM-DD (ссылку можно отправить).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Icon from "@/components/tablo/Icon";
import { Popover, Sheet } from "@/components/tablo/Overlay";
import { ShareList, type ShareAction } from "@/components/tablo/schedule/bits";
import type { FocusLike } from "@/components/tablo/schedule/parts";
import TeacherList from "@/components/tablo/teachers/TeacherList";
import TeacherView, { TeacherDetails, type WeekChoice } from "@/components/tablo/teachers/TeacherView";
import NamePoll from "@/components/tablo/names/NamePoll";
import { answerOf, isHidden, myGroupId, useFullNames } from "@/lib/fullNames";
import { api, DAYS_ORDER, type Lesson, type Teacher } from "@/lib/api";
import { shareScheduleImage } from "@/lib/shareImage";
import { useLayout, useNow } from "@/lib/tablo/hooks";
import { addDays, atMs, diffDays, dushanbeNow, isoOf, parseIso, weekRel, type Block } from "@/lib/tablo/schedule";
import {
  buildTeacherWeek, defaultWeek, emptyWeekInfo, listWeeks, mergeTeacherLists, mondayOf, pushRecent,
  teacherFocus, teacherStatus, weekRange, type ListStatus, type TBlock, type TDay, type TFocus,
} from "@/lib/tablo/teachers";

const RECENT_KEY = "teachers_recent";       // тот же ключ, что в приложении
const VIEW_KEY = "teachers_wide_view";      // table | feed
const DAY_WORD = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const DAY_LABELS: Record<string, string> = Object.fromEntries(DAYS_ORDER.map(d => [d, d.charAt(0).toUpperCase() + d.slice(1)]));

/**
 * Раскрытая карточка по правилу сайта: залита только идущая пара; следующая —
 * спокойная «Следующая · послезавтра, II пара», отсчёт — на сегодня и завтра.
 */
function toFocus(f: TFocus | null, now: Date): FocusLike | null {
  if (!f) return null;
  if (f.kind === "live") return f;
  const rel = diffDays(isoOf(now), f.block.date);
  const word = rel === 0 ? "сегодня" : rel === 1 ? "завтра" : rel === 2 ? "послезавтра"
    : DAY_WORD[(parseIso(f.block.date).getDay() + 6) % 7];
  const startAt = atMs(f.block.date, f.slot.pair_time_start);
  const near = rel <= 1 && startAt > now.getTime();
  return {
    block: f.block, slot: f.slot, filled: false,
    pill: `Следующая · ${word}, ${f.slot.pair_number} пара`,
    countdownLabel: near ? "через" : null, targetAt: near ? startAt : null, progressFrom: null,
  };
}

function readRecent(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch { return []; }
}

export default function TeachersPage() {
  const layout = useLayout();
  const now = useNow(30_000);
  const wide = layout === "wide" || layout === "xwide";

  // ─── Список ──────────────────────────────────────────────────────────────
  const [weeksAll, setWeeksAll] = useState<Array<{ week_start: string; is_latest: boolean }> | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [bulk, setBulk] = useState<Record<string, Lesson[]> | null>(null);
  const [recent, setRecent] = useState<number[]>([]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(false);
    const aw = await api.getAllWeeks().catch(() => null);
    setWeeksAll(aw);
    const ws = listWeeks(aw, isoOf(dushanbeNow()));
    try {
      const lists = await Promise.all(ws.map(w => api.getTeachers(w).catch(() => null)));
      if (lists.every(l => !l)) throw new Error("нет данных");
      setTeachers(mergeTeacherLists(lists));
    } catch {
      setListError(true);
    } finally {
      setListLoading(false);
    }
    // Статусы — в фоне: большой ответ, список без них уже работает
    api.getBulkSync().then(b => setBulk(b.teacher_schedules ?? null)).catch(() => {});
  }, []);

  useEffect(() => { setRecent(readRecent()); loadList(); }, [loadList]);

  const statuses = useMemo(() => {
    const m = new Map<number, ListStatus | null>();
    if (!bulk || !now) return m;
    const monday = mondayOf(isoOf(now));
    for (const t of teachers) m.set(t.id, teacherStatus(now, bulk[`${t.id}_${monday}`] ?? []));
    return m;
  }, [bulk, now, teachers]);

  const weekChoices: WeekChoice[] = useMemo(() => {
    if (!now) return [];
    const thisMonday = mondayOf(isoOf(now));
    return listWeeks(weeksAll, isoOf(now)).map(ws => ({
      weekStart: ws,
      label: ws === thisMonday ? "Эта неделя" : ws === addDays(thisMonday, 7) ? "Следующая" : "Неделя",
    }));
  }, [weeksAll, now]);

  // ─── Выбранный педагог ───────────────────────────────────────────────────
  const [selId, setSelId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [tLoading, setTLoading] = useState(false);
  const [tError, setTError] = useState(false);
  const [nextLessons, setNextLessons] = useState<Lesson[] | null | undefined>(undefined);

  const selTeacher = teachers.find(t => t.id === selId) ?? null;

  // ─── Полные имена (lib/fullNames.ts) ─────────────────────────────────────
  const fullNames = useFullNames();
  const [pollTick, setPollTick] = useState(0);
  const [pollOpen, setPollOpen] = useState(false);
  useEffect(() => { setPollOpen(new URLSearchParams(window.location.search).get("poll") === "1"); }, [selId]);
  const pollFor = useMemo(() => {
    void pollTick;
    const name = selTeacher?.name;
    // Ответить может любой, кто знает (решение владельца 8 окт 2026): строка свёрнута
    // и с крестиком. Сами спрашиваем (напоминание в «Расписании») только свою группу.
    if (!name || !fullNames || fullNames.names[name] || !myGroupId() || !lessons || !lessons.length) return null;
    if (!answerOf(name) && isHidden(name)) return null;
    return name;
  }, [selTeacher, fullNames, lessons, pollTick]);

  // Подробности пары: какая открыта и у какой ячейки
  const [sel, setSel] = useState<{ key: string; el: HTMLElement | null } | null>(null);
  const openBlock = useCallback((b: Block, el: HTMLElement) => setSel({ key: b.key, el }), []);
  const closeSel = useCallback(() => setSel(null), []);

  /** Загрузить неделю педагога. ws не задана — эта, а в воскресенье и в субботу после пар — следующая. */
  const loadTeacher = useCallback(async (id: number, ws?: string) => {
    setTLoading(true);
    setTError(false);
    setNextLessons(undefined);
    const nowD = dushanbeNow();
    const thisMonday = mondayOf(isoOf(nowD));
    const nextMonday = addDays(thisMonday, 7);
    const choices = listWeeks(weeksAll, isoOf(nowD));
    let target = ws && choices.includes(ws) ? ws : choices[0] ?? thisMonday;
    try {
      let ls = await api.getTeacherSchedule(id, target);
      if (!ws && target === thisMonday && choices.includes(nextMonday)) {
        if (defaultWeek(nowD, buildTeacherWeek(ls, target), true) === "next") {
          ls = await api.getTeacherSchedule(id, nextMonday);
          target = nextMonday;
        }
      }
      setWeekStart(target);
      setLessons(ls);
      // Пустая эта неделя — смотрим следующую, чтобы предложить «Показать следующую неделю»
      if (!ls.length && target === thisMonday) {
        if (choices.includes(nextMonday)) {
          api.getTeacherSchedule(id, nextMonday).then(setNextLessons).catch(() => setNextLessons(undefined));
        } else setNextLessons(null);
      }
    } catch {
      setTError(true);
      setWeekStart(target);
      setLessons(null);
    } finally {
      setTLoading(false);
    }
  }, [weeksAll]);

  // Адрес → выбор (при открытии и по «Назад» браузера)
  const readUrl = useCallback(() => {
    const q = new URLSearchParams(window.location.search);
    const id = Number(q.get("teacher")) || null;
    const ws = q.get("week");
    return { id, ws: ws && /^\d{4}-\d{2}-\d{2}$/.test(ws) ? ws : null };
  }, []);

  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (booted || listLoading || layout === null) return;
    setBooted(true);
    const { id, ws } = readUrl();
    const pick = id ?? (wide ? readRecent()[0] ?? null : null);
    if (pick) {
      setSelId(pick);
      loadTeacher(pick, ws ?? undefined);
    }
  }, [booted, listLoading, layout, wide, readUrl, loadTeacher]);

  useEffect(() => {
    const onPop = () => {
      const { id, ws } = readUrl();
      setSelId(id);
      setSel(null);
      if (id) loadTeacher(id, ws ?? undefined);
      else setLessons(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [readUrl, loadTeacher]);

  const setUrl = (id: number | null, ws: string | null, push: boolean) => {
    const url = id ? `/teachers?teacher=${id}${ws ? `&week=${ws}` : ""}` : "/teachers";
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };

  const pickTeacher = useCallback((t: Teacher) => {
    setSel(null);
    setSelId(t.id);
    const r = pushRecent(readRecent(), t.id);
    setRecent(r);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* приватный режим */ }
    // На узком экране — шаг в истории: «Назад» вернёт к списку
    setUrl(t.id, null, !wide);
    loadTeacher(t.id);
    if (!wide) window.scrollTo({ top: 0 });
  }, [wide, loadTeacher]);

  const pickWeek = (ws: string) => {
    if (!selId) return;
    setSel(null);
    setUrl(selId, ws, false);
    loadTeacher(selId, ws);
  };

  // Адрес держим в согласии с открытой неделей (для «Скопировать ссылку»)
  useEffect(() => {
    if (selId && weekStart && booted) setUrl(selId, weekStart, false);
  }, [selId, weekStart, booted]);

  // ─── Неделя педагога ─────────────────────────────────────────────────────
  const days: TDay[] | null = useMemo(
    () => (lessons && weekStart ? buildTeacherWeek(lessons, weekStart) : null), [lessons, weekStart],
  );
  const rel = weekStart && now ? weekRel(weekStart, now) : null;
  const focus = useMemo(
    () => (days && now && rel ? toFocus(teacherFocus(now, days, rel), now) : null), [days, now, rel],
  );
  const empty = useMemo(() => {
    if (!days || days.some(d => d.blocks.length) || !weekStart || !now) return null;
    const which = weekStart === mondayOf(isoOf(now)) ? "this" : "next";
    const nd = nextLessons === undefined ? undefined : nextLessons === null ? null : buildTeacherWeek(nextLessons, addDays(weekStart, 7));
    const info = emptyWeekInfo(which, nd);
    return {
      title: info.title,
      text: info.text,
      nearest: info.nearest ? `${info.nearest.lead}${info.nearest.strong}${info.nearest.tail}` : null,
      showNext: info.showNext,
    };
  }, [days, weekStart, now, nextLessons]);

  // ─── Вид, подробности, «Поделиться» ──────────────────────────────────────
  const [viewMode, setViewMode] = useState<"table" | "feed">("table");
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === "feed") setViewMode("feed"); } catch { /* приватный режим */ }
  }, []);
  const changeView = (v: "table" | "feed") => {
    setViewMode(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* приватный режим */ }
  };
  const effectiveView = layout === "xwide" ? viewMode : "feed";

  const selBlock = useMemo(
    () => (sel && days ? (days.flatMap(d => d.blocks).find(b => b.key === sel.key) as TBlock | undefined) ?? null : null),
    [sel, days],
  );

  const [shareAnchor, setShareAnchor] = useState<HTMLElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const shareItems: ShareAction[] = selTeacher && weekStart ? [
    {
      icon: "image", title: "Картинка недели", sub: weekRange(weekStart),
      onClick: async () => {
        const byDay: Record<string, Lesson[]> = {};
        for (const l of lessons ?? []) (byDay[l.day_of_week] ??= []).push(l);
        const ordered: Record<string, Lesson[]> = {};
        for (const d of DAYS_ORDER) if (byDay[d]) ordered[d] = byDay[d];
        const res = await shareScheduleImage({
          groupLabel: selTeacher.name, weekLabel: weekRange(weekStart), lessonsByDay: ordered, dayLabels: DAY_LABELS, subtitle: "group",
        });
        if (res === "empty") setToast("Пар нет — делиться нечем");
        if (res === "error") setToast("Не получилось создать картинку");
        if (res === "downloaded") setToast("Картинка сохранена");
      },
    },
    {
      icon: "link", title: "Скопировать ссылку", sub: "Откроет этого педагога и неделю",
      onClick: async () => {
        const url = `${window.location.origin}/teachers?teacher=${selTeacher.id}&week=${weekStart}`;
        try { await navigator.clipboard.writeText(url); setToast("Ссылка скопирована"); }
        catch { window.prompt("Ссылка на педагога и неделю", url); }
      },
    },
  ] : [];

  // ─── Рендер ──────────────────────────────────────────────────────────────
  const list = (
    <TeacherList
      teachers={teachers}
      statuses={statuses}
      selectedId={selId}
      recentIds={recent}
      onPick={pickTeacher}
      now={now}
      panel={wide}
      loading={listLoading}
      error={listError}
      onRetry={loadList}
    />
  );

  const view = selId && (selTeacher || tLoading || lessons) ? (
    <TeacherView
      name={selTeacher?.name ?? ""}
      days={days}
      rel={rel}
      now={now}
      focus={focus}
      weeks={weekChoices}
      weekStart={weekStart}
      onWeek={pickWeek}
      wide={wide}
      viewMode={effectiveView}
      onViewMode={changeView}
      showViewToggle={layout === "xwide"}
      selectedKey={sel?.key ?? null}
      onOpen={openBlock}
      onBack={wide ? undefined : () => {
        if (window.history.length > 1 && new URLSearchParams(window.location.search).get("teacher")) window.history.back();
        else { setSelId(null); setUrl(null, null, false); }
      }}
      onShare={el => { setShareAnchor(el); setShareOpen(o => !o); }}
      loading={tLoading}
      error={tError}
      onRetry={() => selId && loadTeacher(selId, weekStart ?? undefined)}
      empty={empty}
      onShowNext={() => weekStart && pickWeek(addDays(weekStart, 7))}
      fullNames={fullNames}
      poll={pollFor ? (
        <NamePoll key={pollFor} teacher={pollFor} variants={fullNames?.variants[pollFor] ?? []}
          ownGroup={!!lessons?.some(l => l.group?.id === myGroupId())}
          startOpen={pollOpen} onHide={() => setPollTick(t => t + 1)} />
      ) : null}
    />
  ) : null;

  return (
    <div className="t-page">
      <Header />
      <main className={`t-main ${layout ? `t-main-${layout}` : ""}`}>
        {layout === null ? null : wide ? (
          <div className="t-tgrid">
            <aside className="t-tside">{list}</aside>
            <section className="min-w-0" aria-label="Расписание педагога">
              {view ?? (
                <div className="t-state">
                  <Icon name="users" size={40} />
                  <h2>Выберите педагога</h2>
                </div>
              )}
            </section>
          </div>
        ) : (
          view ?? list
        )}
      </main>

      {selBlock && (wide ? (
        <Popover anchor={sel?.el ?? null} onClose={closeSel} width={380} placement="side" autoFocus={false} label={selBlock.subject}>
          <TeacherDetails block={selBlock} focus={focus} now={now} weekStart={weekStart} onClose={closeSel}
            hint={effectiveView === "table" ? "Esc — закрыть · стрелки — соседняя пара" : null} />
        </Popover>
      ) : (
        <Sheet onClose={closeSel} label={selBlock.subject}>
          <TeacherDetails block={selBlock} focus={focus} now={now} weekStart={weekStart} onClose={closeSel} hint={null} />
        </Sheet>
      ))}

      {shareOpen && (wide ? (
        <Popover anchor={shareAnchor} onClose={() => setShareOpen(false)} width={360} align="end" label="Поделиться">
          <div className="t-panel p-2"><ShareList items={shareItems} onDone={() => setShareOpen(false)} /></div>
        </Popover>
      ) : (
        <Sheet onClose={() => setShareOpen(false)} label="Поделиться">
          <div className="px-2 pb-2"><ShareList items={shareItems} onDone={() => setShareOpen(false)} /></div>
        </Sheet>
      ))}

      {toast && <div className="t-toast" role="status">{toast}</div>}
    </div>
  );
}
