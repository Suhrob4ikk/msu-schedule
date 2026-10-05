"use client";
/**
 * Вкладка «Расписание» в стиле «Табло» (ТЗ «Сайт · Расписание по образцу APK»).
 *
 * Раскладка зависит от ширины, а не от устройства:
 * - до 640 px — как в приложении: своя шапка, лента или «По дням», шторки;
 * - 640–1023 — верхняя панель, лента в колонке 680 px, ряд дней, под лентой
 *   свободные аудитории;
 * - 1024–1279 — вид «Лента» (сегодня слева, неделя справа в одну колонку);
 * - от 1280 — «Таблица · сегодня шире» или «Лента» на выбор.
 *
 * Данные — как раньше: кэш lib/api.ts (stale-while-revalidate), фоновое
 * обновление через onApiUpdate. Всё, что зависит от ширины, времени и
 * localStorage, считается после монтирования (до него — заглушка), поэтому
 * серверный и первый клиентский рендер совпадают (ошибка #418).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import CourseCheckBanner from "@/components/CourseCheckBanner";
import Bell from "@/components/tablo/Bell";
import StatusChip from "@/components/tablo/StatusChip";
import Icon from "@/components/tablo/Icon";
import { Popover, Sheet } from "@/components/tablo/Overlay";
import { DayBody, DayHeading, dayName } from "@/components/tablo/schedule/parts";
import TableView from "@/components/tablo/schedule/TableView";
import WideFeed from "@/components/tablo/schedule/WideFeed";
import FreeRooms from "@/components/tablo/schedule/FreeRooms";
import LessonDetails from "@/components/tablo/schedule/LessonDetails";
import GroupPanel, { type WeekOption } from "@/components/tablo/schedule/GroupPanel";
import { DayBar, NotPublished, ShareList, type ShareAction } from "@/components/tablo/schedule/bits";
import { api, onApiUpdate, shortGroupName, DAYS_ORDER, type Group, type Lesson, type WeekInfo } from "@/lib/api";
import { shareScheduleImage } from "@/lib/shareImage";
import { useSwipe } from "@/lib/useSwipe";
import { useLayout, useNow } from "@/lib/tablo/hooks";
import {
  addDays, buildWeek, computeFocus, dayTitle, diffDays, doneTodayAt, dushanbeNow, headerTitle, isoOf, rangeLabel,
  weekIsOver, weekRel, weekStatsLine, type Block,
} from "@/lib/tablo/schedule";

const VIEW_KEY = "schedule_view_mode";      // телефон и планшет: list | pages (как в приложении)
const WIDE_VIEW_KEY = "schedule_wide_view"; // от 1280: table | feed
const DAY_LABELS: Record<string, string> = Object.fromEntries(
  DAYS_ORDER.map(d => [d, d.charAt(0).toUpperCase() + d.slice(1)]),
);

const mondayOf = (iso: string) => addDays(iso, -((new Date(iso + "T00:00:00").getDay() + 6) % 7));
const groupLabel = (g: Group) => `${shortGroupName(g.name)} · ${g.year} курс`;

/** «Эта неделя» / «Следующая» / «Прошлая» / «Неделя» — по отношению к сегодняшней. */
function weekWord(ws: string, now: Date): string {
  const diff = diffDays(mondayOf(isoOf(now)), ws);
  return diff === 0 ? "Эта неделя" : diff === 7 ? "Следующая" : diff === -7 ? "Прошлая" : "Неделя";
}
const studyRange = (ws: string) => rangeLabel(ws, addDays(ws, 5));

/**
 * Прокрутить к элементу так, чтобы он встал сразу под закреплёнными шапками
 * (верхняя панель, шапка телефона, ряд дней). Высота шапки телефона зависит
 * от ширины (дата переносится), поэтому меряем, а не берём константу.
 */
function scrollUnderHeader(el: HTMLElement | null, smooth: boolean) {
  if (!el) return;
  let offset = 0;
  for (const s of document.querySelectorAll<HTMLElement>(".t-top, .t-phead, .t-daybar-phone, .t-daybar-tablet")) {
    const r = s.getBoundingClientRect();
    if (r.height && getComputedStyle(s).position === "sticky") offset += r.height + (s.classList.contains("t-daybar-tablet") ? 8 : 0);
  }
  const top = el.getBoundingClientRect().top + window.scrollY - offset - 4;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduce ? "smooth" : "auto" });
}

export default function SchedulePage() {
  const router = useRouter();
  const layout = useLayout();
  const now = useNow(30_000);
  const wideScreen = layout === "wide" || layout === "xwide";

  // ─── Данные ──────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<Group[]>([]);
  const [myGroupId, setMyGroupId] = useState<number | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  /** Открыта неделя, которой ещё нет на msu.tj (стрелка › с последней). */
  const [notPublished, setNotPublished] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userPickedWeek = useRef(false);
  const weekStartRef = useRef<string | null>(null);
  useEffect(() => { weekStartRef.current = weekStart; }, [weekStart]);
  const groupRef = useRef<Group | null>(null);
  useEffect(() => { groupRef.current = group; }, [group]);

  // silent — фоновое обновление: данные на экране уже есть, заглушку не показываем.
  const loadGroup = useCallback(async (g: Group, ws?: string, silent = false) => {
    setGroup(g);
    if (!silent) setLoading(true);
    setError(null);
    try { localStorage.setItem("schedule_view_group_id", String(g.id)); } catch { /* приватный режим */ }
    try {
      const wks = [...(await api.getGroupWeeks(g.id))].sort((a, b) => a.week_start.localeCompare(b.week_start));
      setWeeks(wks);
      const today = isoOf(dushanbeNow());
      let target = ws
        ? wks.find(w => w.week_start === ws)
        : wks.find(w => w.week_start <= today && today <= addDays(w.week_start, 6))
          ?? (wks.length && today > wks[wks.length - 1].week_start ? wks[wks.length - 1] : wks.find(w => w.is_latest) ?? wks[0]);
      if (ws && !target) {
        // Такой недели ещё нет — «ещё не вышло» вместо пустой таблицы
        setWeekStart(ws);
        setLessons([]);
        setNotPublished(true);
        return;
      }
      if (!target) {
        setWeekStart(null);
        setLessons([]);
        setNotPublished(false);
        return;
      }
      let sched = await api.getGroupSchedule(g.id, undefined, target.id);
      // В субботу после последней пары и в воскресенье — следующая неделя, если вышла
      if (!ws && !userPickedWeek.current) {
        const nowD = dushanbeNow();
        if (weekRel(target.week_start, nowD) === "current" && weekIsOver(nowD, buildWeek(sched, target.week_start))) {
          const next = wks.find(w => w.week_start === addDays(target!.week_start, 7));
          if (next) {
            sched = await api.getGroupSchedule(g.id, undefined, next.id);
            target = next;
          }
        }
      }
      setNotPublished(false);
      setWeekStart(target.week_start);
      setLessons(sched);
    } catch {
      // При фоновом обновлении молчим: на экране остаются прежние данные.
      if (!silent) setError("Нет соединения с сервером");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Первая загрузка: своя группа из Кабинета, просматриваемая — из адреса
  // (?group=…&week=… из «Скопировать ссылку») или последняя открытая.
  useEffect(() => {
    let saved: string | null = null;
    let device: string | null = null;
    let viewed: string | null = null;
    try {
      saved = localStorage.getItem("selected_group_id");
      device = localStorage.getItem("msu_device_id_v2");
      viewed = localStorage.getItem("schedule_view_group_id");
    } catch { /* приватный режим */ }
    if (!saved || !device) {
      router.push("/profile");
      return;
    }
    const q = new URLSearchParams(window.location.search);
    const qGroup = Number(q.get("group")) || null;
    const qWeek = q.get("week");
    if (qWeek && /^\d{4}-\d{2}-\d{2}$/.test(qWeek)) userPickedWeek.current = true;

    api.getGroups()
      .then(gs => {
        setGroups(gs);
        // getGroups чинит сохранённый выбор (repairSavedGroup) — читаем заново
        const mine = Number(localStorage.getItem("selected_group_id")) || null;
        if (!mine) {
          router.push("/profile");
          return;
        }
        setMyGroupId(mine);
        const want = qGroup ?? (Number(localStorage.getItem("schedule_view_group_id")) || Number(viewed) || mine);
        const g = gs.find(x => x.id === want) ?? gs.find(x => x.id === mine);
        if (g) loadGroup(g, userPickedWeek.current && qWeek ? qWeek : undefined);
        else setLoading(false);
      })
      .catch(() => { setError("Нет соединения с сервером"); setLoading(false); });
  }, [router, loadGroup]);

  // Фоновое обновление кэша — молча перечитываем.
  useEffect(() => {
    let timer: number | undefined;
    const off = onApiUpdate(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const g = groupRef.current;
        if (g) loadGroup(g, userPickedWeek.current ? weekStartRef.current ?? undefined : undefined, true);
      }, 400);
    });
    // Вернулись на вкладку — спрашиваем список недель: в субботу выходит новая
    const onVis = () => {
      const g = groupRef.current;
      if (!document.hidden && g) api.getGroupWeeks(g.id).catch(() => null);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { off(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [loadGroup]);

  // ─── Производные ─────────────────────────────────────────────────────────
  const days = useMemo(() => (weekStart ? buildWeek(lessons, weekStart) : []), [lessons, weekStart]);
  const shownDays = useMemo(() => days.filter(d => d.dayIndex < 6 || d.blocks.length), [days]);
  const rel = weekStart && now ? weekRel(weekStart, now) : null;
  const focus = useMemo(() => (now && rel && days.length ? computeFocus(now, days, rel) : null), [now, rel, days]);
  const dimPast = rel === "current";
  const myGroup = groups.find(g => g.id === myGroupId) ?? null;
  const foreign = !!group && !!myGroupId && group.id !== myGroupId;
  const todayIso = now ? isoOf(now) : null;
  const doneToday = !!now && dimPast && doneTodayAt(now, days);

  const weekOptions: WeekOption[] = useMemo(() => {
    if (!now) return [];
    const opts: WeekOption[] = weeks.map(w => ({
      weekStart: w.week_start, title: weekWord(w.week_start, now), sub: studyRange(w.week_start), disabled: false,
    }));
    const thisMonday = mondayOf(isoOf(now));
    const nextWs = addDays(thisMonday, 7);
    if (weeks.length && !weeks.some(w => w.week_start === nextWs) && weeks[weeks.length - 1].week_start <= thisMonday) {
      opts.push({ weekStart: nextWs, title: "Следующая", sub: `${studyRange(nextWs)} · ещё не вышла`, disabled: true });
    }
    return opts;
  }, [weeks, now]);

  // Соседние недели для ‹ ›: невышедшая следующая — тоже шаг (показывает «ещё не вышло»).
  const weekNav = useMemo(() => {
    const list = weekOptions.map(o => o.weekStart);
    const i = weekStart ? list.indexOf(weekStart) : -1;
    const placeholder = weekOptions.find(o => o.disabled)?.weekStart ?? null;
    return {
      prev: i > 0 ? list[i - 1] : null,
      next: i >= 0 && i < list.length - 1 ? list[i + 1] : null,
      placeholder,
    };
  }, [weekOptions, weekStart]);

  const pickWeek = useCallback((ws: string) => {
    if (!group) return;
    userPickedWeek.current = true;
    loadGroup(group, ws);
  }, [group, loadGroup]);

  const pickGroup = useCallback((g: Group) => {
    loadGroup(g, userPickedWeek.current && weekStart ? weekStart : undefined);
  }, [loadGroup, weekStart]);

  const thisWeek = now ? weeks.find(w => w.week_start === mondayOf(isoOf(now))) : undefined;
  const toThisWeek = useCallback(() => {
    if (!group) return;
    userPickedWeek.current = false;
    loadGroup(group);
  }, [group, loadGroup]);

  // ─── Вид ─────────────────────────────────────────────────────────────────
  const [phoneMode, setPhoneMode] = useState<"list" | "pages">("list");
  const [wideView, setWideView] = useState<"table" | "feed">("table");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "pages") setPhoneMode("pages");
      if (localStorage.getItem(WIDE_VIEW_KEY) === "feed") setWideView("feed");
    } catch { /* приватный режим */ }
  }, []);
  const changePhoneMode = (m: "list" | "pages") => {
    setPhoneMode(m);
    try { localStorage.setItem(VIEW_KEY, m); } catch { /* приватный режим */ }
  };
  const changeWideView = (v: "table" | "feed") => {
    setWideView(v);
    try { localStorage.setItem(WIDE_VIEW_KEY, v); } catch { /* приватный режим */ }
  };
  // «Неделей/таблицей» — только от 1280: на 1024–1279 шесть столбцов слишком узкие
  const effectiveWide = layout === "xwide" ? wideView : "feed";
  const pagesOn = !wideScreen && phoneMode === "pages";

  // «По дням»: какой день открыт — день раскрытой пары, иначе сегодня, иначе первый с парами
  const [pageDay, setPageDay] = useState<number | null>(null);
  const defaultPageDay = useMemo(() => {
    if (!shownDays.length) return null;
    const f = focus ? shownDays.find(d => d.date === focus.block.date) : undefined;
    return (f ?? shownDays.find(d => d.date === todayIso) ?? shownDays.find(d => d.blocks.length) ?? shownDays[0]).dayIndex;
  }, [shownDays, focus, todayIso]);
  useEffect(() => { setPageDay(null); }, [weekStart, group?.id]);
  const activePageDay = pageDay ?? defaultPageDay;
  const shiftPage = useCallback((step: 1 | -1) => {
    const i = shownDays.findIndex(d => d.dayIndex === activePageDay);
    const next = shownDays[i + step];
    if (next) setPageDay(next.dayIndex);
  }, [shownDays, activePageDay]);
  const swipe = useSwipe(() => shiftPage(1), () => shiftPage(-1));

  // ─── Подробности пары ────────────────────────────────────────────────────
  const [sel, setSel] = useState<{ key: string; el: HTMLElement | null } | null>(null);
  const openBlock = useCallback((b: Block, el: HTMLElement) => setSel({ key: b.key, el }), []);
  const closeSel = useCallback(() => setSel(null), []);
  const selBlock = useMemo(() => (sel ? days.flatMap(d => d.blocks).find(b => b.key === sel.key) ?? null : null), [sel, days]);
  useEffect(() => { setSel(null); }, [weekStart, group?.id, effectiveWide]);

  const [study, setStudy] = useState({ attendance: false, notes: false });
  useEffect(() => {
    try {
      setStudy({
        attendance: localStorage.getItem("feature_attendance") === "1",
        notes: localStorage.getItem("feature_notes") === "1",
      });
    } catch { /* приватный режим */ }
  }, []);

  // ─── Панели ──────────────────────────────────────────────────────────────
  const [groupOpen, setGroupOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Кнопки, у которых открываются панели (кладём из события клика, не из ref при рендере)
  const [groupAnchor, setGroupAnchor] = useState<HTMLElement | null>(null);
  const [shareAnchor, setShareAnchor] = useState<HTMLElement | null>(null);
  const closeGroup = useCallback(() => setGroupOpen(false), []);
  const closeShare = useCallback(() => setShareOpen(false), []);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Клавиши: G — выбор группы, ← → — соседний день в «По дням».
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.key === "g" || e.key === "G" || e.key === "п" || e.key === "П") && group) {
        e.preventDefault();
        setGroupOpen(true);
      } else if (pagesOn && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        shiftPage(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, pagesOn, shiftPage]);

  // ─── Прокрутка ленты к дню раскрытой пары при открытии ──────────────────
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (wideScreen || pagesOn || !weekStart || !group || loading || !now) return;
    const key = `${group.id}|${weekStart}`;
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    const target = focus?.block.date ?? (rel === "current" ? todayIso : null);
    if (!target) { window.scrollTo({ top: 0 }); return; }
    requestAnimationFrame(() => scrollUnderHeader(document.getElementById(`day-${target}`), false));
  }, [wideScreen, pagesOn, weekStart, group, loading, now, focus, rel, todayIso]);

  const scrollToDay = useCallback((dayIndex: number) => {
    const d = days.find(x => x.dayIndex === dayIndex);
    if (!d) return;
    if (pagesOn) { setPageDay(dayIndex); return; }
    scrollUnderHeader(document.getElementById(wideScreen ? `wday-${d.date}` : `day-${d.date}`), true);
  }, [days, pagesOn, wideScreen]);

  // ─── Поделиться ──────────────────────────────────────────────────────────
  const shareImage = useCallback(async (which: "week" | "day") => {
    if (!group || !weekStart) return;
    const pick = which === "week"
      ? shownDays
      : shownDays.filter(d => d.dayIndex === (pagesOn ? activePageDay : (focus ? DAYS_ORDER.indexOf(focus.block.day) : defaultPageDay)));
    const byDay: Record<string, Lesson[]> = {};
    for (const d of pick) if (d.blocks.length) byDay[d.day] = d.blocks.flatMap(b => b.lessons);
    const res = await shareScheduleImage({
      groupLabel: groupLabel(group),
      weekLabel: which === "week" ? studyRange(weekStart) : pick[0] ? DAY_LABELS[pick[0].day] : "",
      lessonsByDay: byDay,
      dayLabels: DAY_LABELS,
    });
    if (res === "empty") setToast("Пар нет — делиться нечем");
    if (res === "error") setToast("Не получилось создать картинку");
    if (res === "downloaded") setToast("Картинка сохранена");
  }, [group, weekStart, shownDays, pagesOn, activePageDay, focus, defaultPageDay]);

  const copyLink = useCallback(async () => {
    if (!group || !weekStart) return;
    const url = `${window.location.origin}/?group=${group.id}&week=${weekStart}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Ссылка скопирована");
    } catch {
      window.prompt("Ссылка на эту группу и неделю", url);
    }
  }, [group, weekStart]);

  const dayForImage = (() => {
    const idx = pagesOn ? activePageDay : focus ? DAYS_ORDER.indexOf(focus.block.day) : defaultPageDay;
    const d = days.find(x => x.dayIndex === idx);
    return d ? dayTitle(d.date) : undefined;
  })();

  const shareItems: ShareAction[] = group ? [
    { icon: "image", title: "Картинка недели", sub: "PNG, как эта неделя", onClick: () => void shareImage("week") },
    { icon: "image", title: "Картинка дня", sub: dayForImage, onClick: () => void shareImage("day") },
    { icon: "link", title: "Скопировать ссылку", sub: "Откроет эту группу и неделю", onClick: () => void copyLink() },
  ] : [];

  // ─── Рендер ──────────────────────────────────────────────────────────────
  const weekTitle = weekStart && now
    ? `${weekWord(weekStart, now)} · ${studyRange(weekStart)}`
    : "";

  const groupPanel = (
    <GroupPanel
      groups={groups}
      group={group}
      myGroup={myGroup}
      weeks={weekOptions}
      weekStart={weekStart}
      onPickWeek={ws => { pickWeek(ws); if (!wideScreen) setGroupOpen(false); }}
      onPickGroup={g => { pickGroup(g); setGroupOpen(false); }}
      viewMode={wideScreen ? undefined : phoneMode}
      onViewMode={wideScreen ? undefined : m => { changePhoneMode(m); setGroupOpen(false); }}
      footer={layout === "phone" && group ? (
        <div className="mt-3 pt-2 border-t border-[var(--line)]">
          <ShareList items={shareItems} onDone={closeGroup} />
        </div>
      ) : undefined}
    />
  );

  const details = selBlock && (
    <LessonDetails
      block={selBlock}
      focus={focus}
      days={days}
      now={now}
      onClose={closeSel}
      study={!foreign && myGroupId && (study.attendance || study.notes) ? { groupId: myGroupId, ...study } : null}
      hint={wideScreen && effectiveWide === "table" ? "Esc — закрыть · стрелки — соседняя пара" : null}
    />
  );

  const listDays = (
    <div className="t-feed">
      {rel && rel !== "current" && lessons.length > 0 && (
        <p className="t-weekstats">{weekStatsLine(days, lessons)}</p>
      )}
      {shownDays.map(d => (
        <section key={d.date} className="t-day" aria-label={dayName(d)}>
          <DayHeading day={d} now={now} id={`day-${d.date}`} />
          <DayBody
            day={d}
            now={now}
            focus={focus && focus.block.date === d.date ? focus : null}
            dimPast={dimPast}
            selectedKey={sel?.key ?? null}
            onOpen={openBlock}
            doneLine={doneToday && d.date === todayIso}
          />
        </section>
      ))}
    </div>
  );

  const pageView = (() => {
    const i = shownDays.findIndex(d => d.dayIndex === activePageDay);
    const d = shownDays[i];
    if (!d) return null;
    return (
      <div className="t-feed" {...swipe}>
        <section key={d.date} className="t-day t-slide" aria-label={dayName(d)}>
          <DayHeading day={d} now={now} id={`day-${d.date}`} />
          <DayBody
            day={d}
            now={now}
            focus={focus && focus.block.date === d.date ? focus : null}
            dimPast={dimPast}
            selectedKey={sel?.key ?? null}
            onOpen={openBlock}
            doneLine={doneToday && d.date === todayIso}
          />
        </section>
      </div>
    );
  })();

  const emptyWeek = !loading && !error && weekStart && !notPublished && lessons.length === 0;

  const body = (() => {
    if (error && !lessons.length) {
      return (
        <div className="t-state">
          <Icon name="wifiOff" size={40} />
          <h2>{error}</h2>
          <button type="button" className="t-btn-fill" onClick={() => window.location.reload()}>Повторить</button>
        </div>
      );
    }
    if (loading && !lessons.length) return <ScheduleSkeleton wide={wideScreen} />;
    if (notPublished && weekStart) {
      return <NotPublished range={studyRange(weekStart)} onBack={toThisWeek} />;
    }
    if (emptyWeek) {
      return (
        <div className="t-state">
          <Icon name="calendar" size={40} />
          <h2>Пар на этой неделе нет</h2>
        </div>
      );
    }
    if (!weekStart) return null;
    if (wideScreen) {
      return effectiveWide === "table" ? (
        <TableView days={days} now={now} focus={focus} dimPast={dimPast} selectedKey={sel?.key ?? null}
          onOpen={openBlock} />
      ) : (
        <WideFeed days={days} now={now} focus={focus} dimPast={dimPast} selectedKey={sel?.key ?? null}
          onOpen={openBlock} twoColumns={layout === "xwide"} />
      );
    }
    return pagesOn ? pageView : listDays;
  })();

  const groupButtonText = group ? groupLabel(group) : "Группа";

  return (
    <div className="t-page">
      <Header phone={false} />

      {/* Телефон: шапка как в приложении — одна кнопка, открывает шторку недели и группы */}
      {layout === "phone" && (
        <div className="t-phead">
          <button type="button" className="t-phead-btn" onClick={() => setGroupOpen(true)} aria-haspopup="dialog">
            <span className={`t-phead-sub ${foreign ? "t-ink" : ""}`}>
              {group ? groupLabel(group) : "Группа"}
              {weekStart && now ? ` · ${weekWord(weekStart, now).toLowerCase()}` : ""}
            </span>
            <span className="t-phead-title">{weekStart && now ? headerTitle(weekStart, now) : "Расписание"}</span>
            <Icon name="chevronDown" size={18} strokeWidth={2.2} />
          </button>
          <StatusChip compact />
          <Bell />
        </div>
      )}
      {layout === "phone" && pagesOn && days.length > 0 && !notPublished && (
        <DayBar days={shownDays} selected={activePageDay} now={now} onPick={setPageDay} className="t-daybar-phone" />
      )}

      <main className={`t-main ${layout ? `t-main-${layout}` : ""}`}>
        <CourseCheckBanner />

        {/* Панель инструментов — от 640 px */}
        {layout && layout !== "phone" && (
          <div className="t-toolbar">
            <button type="button" onClick={e => { setGroupAnchor(e.currentTarget); setGroupOpen(o => !o); }} aria-expanded={groupOpen}
              aria-haspopup="dialog" className={`t-gbtn ${foreign ? "t-gbtn-foreign" : ""} ${groupOpen ? "t-gbtn-open" : ""}`}>
              {groupButtonText}
              <Icon name="chevronDown" size={20} strokeWidth={2} />
            </button>
            {foreign && myGroup && (
              <button type="button" className="t-mine-btn" onClick={() => pickGroup(myGroup)}>
                <Icon name="undo" size={20} />
                <span>К моей группе<span className="max-md:hidden"> · {groupLabel(myGroup)}</span></span>
              </button>
            )}
            {weekStart && (
              <div className="t-weeknav">
                <button type="button" aria-label="Предыдущая неделя" disabled={notPublished ? false : !weekNav.prev}
                  onClick={() => {
                    if (notPublished) { const last = weeks[weeks.length - 1]; if (last) pickWeek(last.week_start); }
                    else if (weekNav.prev) pickWeek(weekNav.prev);
                  }}>
                  <Icon name="chevronLeft" size={20} />
                </button>
                <span>{weekTitle}</span>
                <button type="button" aria-label="Следующая неделя" disabled={notPublished || !weekNav.next}
                  onClick={() => weekNav.next && pickWeek(weekNav.next)}>
                  <Icon name="chevronRight" size={20} />
                </button>
              </div>
            )}
            <div className="flex-1" />
            {layout === "xwide" && (
              <div className="t-seg t-seg-view" role="radiogroup" aria-label="Вид">
                {([["feed", "Лента"], ["table", "Таблица"]] as const).map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={wideView === v}
                    className={`t-seg-btn ${wideView === v ? "t-seg-on" : ""}`} onClick={() => changeWideView(v)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {group && (
              <button type="button" className={`t-share-btn ${shareOpen ? "t-gbtn-open" : ""}`}
                onClick={e => { setShareAnchor(e.currentTarget); setShareOpen(o => !o); }} aria-expanded={shareOpen} aria-haspopup="dialog">
                <Icon name="share" size={20} />
                <span className="max-md:sr-only">Поделиться</span>
              </button>
            )}
          </div>
        )}

        {/* Планшет: ряд дней — навигация по ленте */}
        {layout === "tablet" && days.length > 0 && !notPublished && (
          <DayBar days={shownDays} selected={pagesOn ? activePageDay : null} now={now}
            onPick={scrollToDay} className="t-daybar-tablet" />
        )}

        {body}

        {layout === "tablet" && !notPublished && <FreeRooms now={now} limit={6} className="mt-6" />}
      </main>

      {/* «К этой неделе» — когда открыта не текущая неделя (телефон и планшет) */}
      {!wideScreen && layout && thisWeek && weekStart !== thisWeek.week_start && !notPublished && (
        <button type="button" className="t-tothis" onClick={toThisWeek}>
          <Icon name="chevronUp" size={18} strokeWidth={2.2} />К этой неделе
        </button>
      )}

      {/* Выбор недели и группы */}
      {groupOpen && (layout === "phone" ? (
        <Sheet onClose={closeGroup} label="Неделя и группа">{groupPanel}</Sheet>
      ) : (
        <Popover anchor={groupAnchor ?? document.querySelector<HTMLElement>(".t-gbtn")} onClose={closeGroup} width={400} label="Неделя и группа">
          <div className="t-panel">{groupPanel}</div>
        </Popover>
      ))}

      {/* Поделиться */}
      {shareOpen && layout !== "phone" && (
        <Popover anchor={shareAnchor} onClose={closeShare} width={380} align="end" label="Поделиться">
          <div className="t-panel p-2"><ShareList items={shareItems} onDone={closeShare} /></div>
        </Popover>
      )}

      {/* Подробности пары: рядом с ячейкой на широком экране, шторкой — на узком */}
      {details && (wideScreen ? (
        <Popover anchor={sel?.el ?? null} onClose={closeSel} width={360} placement="side" autoFocus={false} label={selBlock?.lessons[0].subject ?? "Пара"}>
          {details}
        </Popover>
      ) : (
        <Sheet onClose={closeSel} label={selBlock?.lessons[0].subject ?? "Пара"}>{details}</Sheet>
      ))}

      {toast && <div className="t-toast" role="status">{toast}</div>}
    </div>
  );
}

function ScheduleSkeleton({ wide }: { wide: boolean }) {
  return (
    <div className={wide ? "t-skel-wide" : "t-feed"} aria-label="Загружаем расписание" role="status">
      {Array.from({ length: wide ? 6 : 3 }, (_, i) => (
        <div key={i} className="t-skel t-skel-block" />
      ))}
    </div>
  );
}
