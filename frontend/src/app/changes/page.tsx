"use client";
/**
 * Вкладка «Изменения» в стиле «Табло» (макеты izmeneniya-*): слева фильтры
 * (группа, виды, период), по центру лента, справа зачёты и экзамены своей
 * группы и ссылка на приложение. Уже 1280 — одна колонка.
 *
 * Лента строится из /schedule/changes без фильтра по группе: «Моя группа» и
 * счётчики считаются здесь (lib/tablo/changes.ts → historyList), а «Перенос»
 * склеивается из удалённой и добавленной пары (lib/tablo/feed.ts).
 * Нажатие на запись открывает группу на нужной неделе.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Icon from "@/components/tablo/Icon";
import { api, shortGroupName, type Group, type Lesson } from "@/lib/api";
import {
  changeKind, groupLine, historyList, studyWeekRange, type ChangeRec,
} from "@/lib/tablo/changes";
import {
  buildFeed, CORE_KINDS, FEED_LABEL, FEED_TONE, feedDiff, KIND_ORDER, slotDay, slotShort, stamp, subjectOf,
  type FeedKind, type FeedRow,
} from "@/lib/tablo/feed";
import { useLayout, useNow } from "@/lib/tablo/hooks";
import { mondayOf } from "@/lib/tablo/rooms";
import { addDays, isoOf, parseIso, plural } from "@/lib/tablo/schedule";

const SEEN_KEY = "changes_last_seen";
type Period = "2w" | "month" | "all";
const PERIOD_DAYS: Record<Period, number> = { "2w": 14, month: 30, all: Infinity };
const MONTHS_SHORT = ["ЯНВ", "ФЕВ", "МАР", "АПР", "МАЯ", "ИЮН", "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"];
const DAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

interface Exam { key: string; date: string; subject: string; line: string }

/** Зачёты и экзамены своей группы: эта и следующая недели, начиная с сегодня. */
async function loadExams(groupId: number, today: string): Promise<Exam[]> {
  const weeks = await api.getGroupWeeks(groupId);
  const cur = mondayOf(today);
  const take = weeks.filter(w => w.week_start >= cur).sort((a, b) => a.week_start.localeCompare(b.week_start)).slice(0, 2);
  const lists = await Promise.all(take.map(w => api.getGroupSchedule(groupId, undefined, w.id).then(ls => ({ w, ls })).catch(() => null)));
  const out: Exam[] = [];
  for (const item of lists) {
    if (!item) continue;
    for (const l of item.ls as Lesson[]) {
      if (!/экзамен|зач/i.test(l.lesson_type ?? "")) continue;
      const di = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"].indexOf(l.day_of_week.toLowerCase());
      const date = l.lesson_date ?? (di >= 0 ? addDays(item.w.week_start, di) : null);
      if (!date || date < today) continue;
      const d = parseIso(date);
      const kind = /экз/i.test(l.lesson_type ?? "") ? "Экзамен" : "Зачёт";
      const line = [DAY_SHORT[(d.getDay() + 6) % 7], l.pair_time_start, l.room?.name, kind, l.teacher?.name].filter(Boolean).join(" · ");
      out.push({ key: `${l.id}`, date, subject: l.subject, line });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject, "ru"));
}

export default function ChangesPage() {
  const layout = useLayout();
  const now = useNow(60_000);

  const [all, setAll] = useState<ChangeRec[] | null>(null);
  const [error, setError] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [myId, setMyId] = useState<number | null>(null);
  const [scope, setScope] = useState<"my" | "all">("all");
  const [period, setPeriod] = useState<Period>("2w");
  const [off, setOff] = useState<Set<FeedKind>>(new Set());
  const [seen, setSeen] = useState<number | null>(null);
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [apk, setApk] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(false);
    api.getChanges()
      .then(d => setAll(d as ChangeRec[]))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    let id: number | null = null;
    let prev: number | null = null;
    try {
      id = Number(localStorage.getItem("selected_group_id")) || null;
      const s = localStorage.getItem(SEEN_KEY);
      prev = s ? Date.parse(s) : null;
    } catch { /* приватный режим */ }
    setMyId(id);
    setSeen(prev !== null && !Number.isNaN(prev) ? prev : null);
    if (id) setScope("my");
    api.getGroups().then(setGroups).catch(() => {});
    api.getAppVersion().then(i => setApk(i.download_url)).catch(() => {});
    load();
  }, [load]);

  // Открытие страницы гасит «новое» в колокольчике, но на самой странице отметки остаются до ухода
  useEffect(() => {
    if (!all?.length) return;
    const newest = all.reduce((m, c) => (c.detected_at > m ? c.detected_at : m), "");
    try { if (newest) localStorage.setItem(SEEN_KEY, newest); } catch { /* приватный режим */ }
  }, [all]);

  const today = now ? isoOf(now) : "";
  useEffect(() => {
    if (!myId || !today) return;
    loadExams(myId, today).then(setExams).catch(() => setExams([]));
  }, [myId, today]);

  const byId = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);
  const my = myId ? byId.get(myId) ?? null : null;

  const scoped = useMemo(() => {
    if (!all) return null;
    return historyList(all, scope === "my" && my ? "my" : "all", my, null, byId);
  }, [all, scope, my, byId]);

  const inPeriod = useMemo(() => {
    if (!scoped || !now) return null;
    const from = now.getTime() - PERIOD_DAYS[period] * 86_400_000;
    return scoped.filter(c => Date.parse(c.detected_at) >= from);
  }, [scoped, period, now]);

  const feed = useMemo(() => (inPeriod ? buildFeed(inPeriod) : null), [inPeriod]);

  const counts = useMemo(() => {
    const m = new Map<FeedKind, number>();
    for (const r of feed ?? []) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return m;
  }, [feed]);
  const kinds = KIND_ORDER.filter(k => CORE_KINDS.includes(k) || (counts.get(k) ?? 0) > 0);

  const shown = useMemo(() => (feed ?? []).filter(r => !off.has(r.kind)), [feed, off]);
  const isNew = (r: FeedRow) => seen !== null && r.at > seen;
  const fresh = shown.filter(isNew);
  const older = shown.filter(r => !isNew(r));

  const toggle = (k: FeedKind) => setOff(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const href = (r: FeedRow) => {
    const gid = r.c.group_id ?? (my && changeKind(r.c.change_type) === "new_week" ? my.id : null);
    return gid && r.c.week_start ? `/?group=${gid}&week=${r.c.week_start}` : "/";
  };

  const newCount = (feed ?? []).filter(isNew).length;
  const scopeNote = scope === "my" && my
    ? `${shortGroupName(my.name)} · ${my.year} курс`
    : "Все факультеты";

  const row = (r: FeedRow) => {
    const c = r.c;
    const unread = isNew(r);
    const subject = subjectOf(c);
    const day = slotDay(c);
    let title: React.ReactNode;
    let detail: React.ReactNode = null;
    if (r.kind === "week") {
      title = c.week_start ? `Вышло расписание на ${studyWeekRange(c.week_start)}` : "Вышло новое расписание";
      detail = <>открыть неделю{scope === "all" ? ` · ${c.faculty_code}` : ""}</>;
    } else {
      title = [subject, day, c.pair_number ? `${c.pair_number} пара` : null].filter(Boolean).join(" · ") || "Изменение расписания";
      if (r.kind === "move" && r.to) {
        detail = (
          <>
            <s>{slotShort(c)}</s> → <b>{slotShort(r.to)}</b>
            {r.to.new_details?.room ? ` · ${r.to.new_details.room}` : ""}
          </>
        );
      } else {
        const d = feedDiff(r);
        detail = d.note && !d.before && !d.after ? d.note : (
          <>
            {d.label ? `${d.label} ` : ""}
            {d.before && <s>{d.before}</s>}
            {d.before && d.after ? " → " : ""}
            {d.after && <b>{d.after}</b>}
            {d.note ? ` · ${d.note}` : ""}
          </>
        );
      }
    }
    const group = scope === "all" && r.kind !== "week" ? groupLine(c, byId) : null;
    return (
      <li key={r.id}>
        <Link href={href(r)} className={`t-ch-row ${unread ? "t-ch-new" : ""}`}>
          {unread && <i className="t-ch-dot" aria-label="Новое" />}
          <span className="t-ch-badge"><span className={`t-badge t-tone-${FEED_TONE[r.kind]}`}>{FEED_LABEL[r.kind]}</span></span>
          <span className="t-ch-main">
            <strong>{title}</strong>
            <span>{detail}{group ? `${detail ? " · " : ""}${group}` : ""}</span>
          </span>
          <time className="t-ch-time">{stamp(r.at)}</time>
          <Icon name="chevronRight" size={18} />
        </Link>
      </li>
    );
  };

  const filters = (
    <div className="t-ch-filters">
      {my && (
        <div className="t-seg" role="radiogroup" aria-label="Чьи изменения">
          {([["my", "Моя группа"], ["all", "Все"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={scope === k}
              className={`t-seg-btn ${scope === k ? "t-seg-on" : ""}`} onClick={() => setScope(k)}>{label}</button>
          ))}
        </div>
      )}
      <details className="t-ch-more" open={layout === "xwide"}>
      <summary>Фильтры</summary>
      <p className="t-over">Что изменилось</p>
      <div className="t-ch-kinds">
        {kinds.map(k => (
          <label key={k} className="t-ch-check">
            <input type="checkbox" checked={!off.has(k)} onChange={() => toggle(k)} />
            <i aria-hidden="true"><Icon name="check" size={16} strokeWidth={2.6} /></i>
            <span>{FEED_LABEL[k]}</span>
            <em>{counts.get(k) ?? 0}</em>
          </label>
        ))}
      </div>
      <p className="t-over">Когда</p>
      <div className="t-seg" role="radiogroup" aria-label="Период">
        {([["2w", "2 недели"], ["month", "Месяц"], ["all", "Всё"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={period === k}
            className={`t-seg-btn ${period === k ? "t-seg-on" : ""}`} onClick={() => setPeriod(k)}>{label}</button>
        ))}
      </div>
      </details>
    </div>
  );

  const side = (
    <div className="t-ch-sidecol">
      {my && (
        <section className="t-card t-ch-exams" aria-label="Зачёты и экзамены">
          <header>
            <h2>Зачёты и экзамены</h2>
            {exams && exams.length > 0 && <span className="t-count">{exams.length}</span>}
          </header>
          {exams === null ? (
            <div className="t-skel t-skel-block" style={{ height: 120 }} />
          ) : exams.length === 0 ? (
            <p className="t-ch-none">В ближайшие две недели зачётов и экзаменов нет</p>
          ) : (
            <ul>
              {exams.slice(0, 6).map(e => {
                const d = parseIso(e.date);
                return (
                  <li key={e.key}>
                    <span className="t-ch-date"><b>{d.getDate()}</b>{MONTHS_SHORT[d.getMonth()]}</span>
                    <span className="t-ch-exam"><strong>{e.subject}</strong><span>{e.line}</span></span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {apk && (
        <section className="t-card t-ch-apk">
          <h2>Уведомления о заменах</h2>
          <p>Приходят в приложении для Android: о заменах, накануне зачёта и за 10 минут до пары</p>
          <a href={apk} className="t-btn-ghost t-ch-apk-btn">Скачать APK</a>
        </section>
      )}
    </div>
  );

  const body = error && !all ? (
    <div className="t-state">
      <Icon name="wifiOff" size={40} />
      <h2>Не удалось загрузить изменения</h2>
      <button type="button" className="t-btn-fill" onClick={load}>Повторить</button>
    </div>
  ) : !feed ? (
    <div className="t-ch-skel" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => <span key={i} className="t-skel" />)}
    </div>
  ) : shown.length === 0 ? (
    <div className="t-state">
      <Icon name="bell" size={40} />
      <h2>Изменений нет</h2>
      <p>{off.size ? "Под выбранные фильтры ничего не подходит" : "За выбранный период расписание не менялось"}</p>
    </div>
  ) : (
    <>
      {fresh.length > 0 && (
        <section>
          <h2 className="t-ch-sec t-ch-sec-new">Новые · с вашего прошлого визита</h2>
          <ul className="t-ch-list">{fresh.map(row)}</ul>
        </section>
      )}
      {older.length > 0 && (
        <section>
          {fresh.length > 0 && <h2 className="t-ch-sec">Раньше</h2>}
          <ul className="t-ch-list">{older.map(row)}</ul>
        </section>
      )}
    </>
  );

  return (
    <div className="t-page">
      <Header />
      <main className={`t-main ${layout ? `t-main-${layout}` : ""}`}>
        {layout === null ? null : (
          <div className="t-ch-layout">
            <aside className="t-ch-left" aria-label="Фильтры">{filters}</aside>
            <section className="min-w-0" aria-label="Лента изменений">
              <div className="t-ch-title">
                <h1>Изменения</h1>
                <span>
                  {scopeNote}
                  {newCount > 0 && ` · ${newCount} ${plural(newCount, "новая", "новых", "новых")}`}
                </span>
              </div>
              {body}
            </section>
            <aside className="t-ch-right">{side}</aside>
          </div>
        )}
      </main>
    </div>
  );
}
