/**
 * Профиль владельца (выбор владельца из демо, 11 окт 2026): серия по Фибоначчи, уровни-
 * математики, «теоремы» вместо медалей, семестр. Сервер хранит то же, что у «золотого
 * профиля» (person = "owner", backend/app/services/vip_progress.py) — даты посещений,
 * будни без пар и события; всё остальное считается здесь.
 */
import { computeStreak, humanDate, todayIso, type VipProgressState } from "./vipProgress";
import { PAIR_NUMBERS, type Lesson } from "./api";

export const OWNER_PERSON = "owner";
export const OWNER_VISIT_KEY = "owner_visit_day";      // день последней отметки
export const OWNER_FLAGS_KEY = "owner_flags_sent";     // события, уже принятые сервером
export const OWNER_TABS_KEY = "owner_tabs_seen";       // вкладки («Теорема о полноте»)
export const OWNER_SEEN_KEY = "owner_seen";            // теоремы и уровень, о которых уже был баннер

// ─── Серия: отметки на числах Фибоначчи ─────────────────────────────────────
export const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
export const nextFib = (streak: number) => FIB.find(n => n > streak) ?? null;

// ─── Уровни: очки = учебные дни, когда заходили, + 3 за каждую доказанную теорему ─
export const LEVELS = ["Пифагор", "Евклид", "Архимед", "Декарт", "Ньютон", "Эйлер", "Гаусс", "Риман", "Лобачевский", "Колмогоров"];
const LEVEL_AT = [0, 5, 12, 22, 35, 50, 70, 95, 125, 160];

export interface LevelInfo { level: number; name: string; points: number; next: string | null; toNext: number; share: number }

export function levelOf(points: number): LevelInfo {
  let i = 0;
  while (i + 1 < LEVEL_AT.length && points >= LEVEL_AT[i + 1]) i++;
  const top = i === LEVEL_AT.length - 1;
  const span = top ? 1 : LEVEL_AT[i + 1] - LEVEL_AT[i];
  return {
    level: i + 1, name: LEVELS[i], points,
    next: top ? null : LEVELS[i + 1], toNext: top ? 0 : LEVEL_AT[i + 1] - points,
    share: top ? 1 : (points - LEVEL_AT[i]) / span,
  };
}

// ─── Теоремы ────────────────────────────────────────────────────────────────
export interface Theorem {
  id: string;
  name: string;          // у секретной до доказательства — «? ? ?»
  statement: string | null; // формулировка; у секретной — нет
  short: string;         // коротко на плитке
  got: string | null;    // когда доказано: YYYY-MM-DD или YYYY-MM-DDTHH:MM
  secret?: boolean;
  /** Сколько уже сделано — у теорем «N раз» (владелец: «хочу видеть, сколько уже зашёл»). */
  progress?: { cur: number; goal: number; unit: string; note?: string };
}

const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]);
const toDate = (s: string) => new Date(s + "T00:00:00");
const addDays = (s: string, n: number) => { const d = toDate(s); d.setDate(d.getDate() + n); return todayIso(d); };

/** Первая полная учебная неделя без пропусков: каждый учебный день пн–сб (кроме дней без пар) — заход. Когда закончилась. */
function perfectWeek(st: VipProgressState, today: string): string | null {
  const visited = new Set(st.days), off = new Set(st.offdays);
  const start = st.first_day ?? st.days[0];
  if (!start) return null;
  let mon = addDays(start, -((toDate(start).getDay() + 6) % 7));
  if (mon < start) mon = addDays(mon, 7);            // первая неделя — целиком после первого входа
  for (; addDays(mon, 5) < today; mon = addDays(mon, 7)) {
    let study = 0, ok = true;
    for (let i = 0; i < 6; i++) {
      const d = addDays(mon, i);
      if (off.has(d)) continue;
      study++;
      if (!visited.has(d)) { ok = false; break; }
    }
    if (ok && study > 0) return addDays(mon, 5);
  }
  return null;
}

/** Эта неделя для «Аксиомы постоянства»: сколько учебных дней (пн–сб, кроме дней без пар) уже
 *  с заходом, сколько всего; был ли пропуск в прошедший день — тогда неделя уже не засчитается. */
function weekProgress(st: VipProgressState, today: string): { cur: number; goal: number; missed: boolean } {
  const visited = new Set(st.days), off = new Set(st.offdays);
  const mon = addDays(today, -((toDate(today).getDay() + 6) % 7));
  let cur = 0, goal = 0, missed = false;
  for (let i = 0; i < 6; i++) {
    const d = addDays(mon, i);
    if (off.has(d)) continue;
    goal++;
    if (visited.has(d)) cur++;
    else if (d < today) missed = true;
  }
  return { cur, goal, missed };
}

const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

export function buildTheorems(st: VipProgressState, today: string, streak: number, streakReached21: string | null, total: number, tabs: number): Theorem[] {
  const ev = st.events;
  const primeDays = st.days.filter(d => PRIMES.has(Number(d.slice(8, 10))));
  const start = st.first_day ?? st.days[0] ?? null;
  const zero = ev.zero ?? null;
  const wk = weekProgress(st, today);
  return [
    { id: "early", name: "Лемма о раннем подъёме", statement: "Открыть расписание до 7:30.", short: "до 7:30", got: ev.early ?? null },
    { id: "explorer", name: "Теорема о полноте", statement: "Заглянуть во все вкладки сайта: Расписание, Педагоги, Аудитории, Изменения и Кабинет.", short: "все вкладки", got: ev.explorer ?? null,
      progress: { cur: Math.min(tabs, 5), goal: 5, unit: plural(5, "вкладки", "вкладок", "вкладок") } },
    { id: "week", name: "Аксиома постоянства", statement: "Неделя без единого пропуска: каждый учебный день — хотя бы один заход.", short: "неделя без пропусков", got: perfectWeek(st, today),
      progress: { cur: wk.cur, goal: wk.goal, unit: "дней на этой неделе", note: wk.missed ? "На этой неделе был пропуск — заново с понедельника" : undefined } },
    { id: "pi", name: "Число π", statement: "Открыть сайт ровно в 15:14 — это 3,14.", short: "в 15:14", got: ev.pi ?? null },
    { id: "palindrome", name: "Палиндром", statement: "Зайти в 12:21 или 21:12 — время читается одинаково с обеих сторон.", short: "в 12:21 или 21:12", got: ev.palindrome ?? null },
    { id: "primes", name: "Простые дни", statement: "Заходить пять дней с простым числом: 2, 3, 5, 7, 11, 13…", short: "5 простых дат", got: primeDays.length >= 5 ? primeDays[4] : null,
      progress: { cur: Math.min(primeDays.length, 5), goal: 5, unit: "простых дат" } },
    { id: "owl", name: "Теорема о полуночи", statement: "Заглянуть в расписание после 23:00.", short: "после 23:00", got: ev.owl ?? null },
    { id: "fib", name: "Ряд Фибоначчи", statement: "Серия дошла до 21 учебного дня подряд.", short: "серия 21 день", got: streakReached21,
      progress: { cur: Math.min(streak, 21), goal: 21, unit: "дня подряд" } },
    { id: "hundred", name: "Бесконечный ряд", statement: "100 дней с первого входа.", short: "100 дней с нами", got: start && total >= 100 ? addDays(start, 99) : null,
      progress: { cur: Math.min(total, 100), goal: 100, unit: "дней с нами" } },
    zero
      ? { id: "zero", name: "Нулевая точка", statement: "Открыть сайт ровно в полночь, в 0:00.", short: "в 0:00", got: zero, secret: true }
      : { id: "zero", name: "? ? ?", statement: null, short: "условие скрыто", got: null, secret: true },
  ];
}

const stamp = (s: string) => (s.length > 10 ? `${humanDate(s)}, ${Number(s.slice(11, 13))}:${s.slice(14, 16)}` : humanDate(s));
export const theoremWhen = (t: Theorem) => (t.got ? stamp(t.got) : "");

export interface OwnerProgress {
  streak: number; best: number; total: number; frozenThisWeek: boolean;
  theorems: Theorem[]; proved: number; level: LevelInfo;
}

/** tabs — сколько вкладок уже открывал (localStorage, OWNER_TABS_KEY), для «Теоремы о полноте». */
export function computeOwner(st: VipProgressState, today: string, tabs = 0): OwnerProgress {
  const s = computeStreak(st, today, FIB);
  const theorems = buildTheorems(st, today, s.streak, s.reached[21] ?? null, s.total, tabs);
  const proved = theorems.filter(t => t.got).length;
  // очки: учебные дни (воскресенье не считается), когда заходили, и 3 за теорему
  const studyDays = st.days.filter(d => toDate(d).getDay() !== 0).length;
  const mon = addDays(today, -((toDate(today).getDay() + 6) % 7));
  return {
    streak: s.streak, best: s.best, total: s.total,
    frozenThisWeek: [...s.frozen].some(d => d >= mon),
    theorems, proved, level: levelOf(studyDays + proved * 3),
  };
}

// ─── Семестр ─────────────────────────────────────────────────────────────────
// Примерные границы: осенний — 1 сентября → сессия с 15 декабря (владелец: «сессия обычно
// уже в декабре»), весенний — 9 февраля → сессия с 1 июня. Поменялись — правьте здесь.
const TERMS: [number, number, number, number][] = [[8, 1, 11, 15], [1, 9, 5, 1]]; // [мес, день] начала и сессии (мес с 0)

export interface TermInfo { share: number; week: number; weeks: number; weeksLeft: number; startLabel: string; sessionLabel: string }
/** Где мы в семестре. null — сессия или каникулы. */
export function termOf(now: Date): TermInfo | null {
  const y = now.getFullYear();
  for (const [sm, sd, em, ed] of TERMS) {
    const start = new Date(y, sm, sd), end = new Date(y, em, ed);
    if (now >= start && now < end) {
      const day = 86400000;
      const weeks = Math.round((end.getTime() - start.getTime()) / (7 * day));
      const week = Math.floor((now.getTime() - start.getTime()) / (7 * day)) + 1;
      return {
        share: (now.getTime() - start.getTime()) / (end.getTime() - start.getTime()),
        week, weeks, weeksLeft: Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (7 * day))),
        startLabel: humanDate(todayIso(start)), sessionLabel: humanDate(todayIso(end)),
      };
    }
  }
  return null;
}

// ─── Моя неделя: пары, часы, окна, ближайший зачёт ──────────────────────────
export interface WeekStats { pairs: number; hours: number; windows: number }

export function weekStats(lessons: Lesson[]): WeekStats {
  const byDay = new Map<string, Set<number>>();
  for (const l of lessons) {
    const i = PAIR_NUMBERS.indexOf(l.pair_number);
    if (i < 0) continue;
    if (!byDay.has(l.day_of_week)) byDay.set(l.day_of_week, new Set());
    byDay.get(l.day_of_week)!.add(i);
  }
  let pairs = 0, windows = 0;
  for (const set of byDay.values()) {
    const idx = [...set].sort((a, b) => a - b);
    pairs += idx.length;
    windows += idx[idx.length - 1] - idx[0] + 1 - idx.length;
  }
  return { pairs, hours: pairs * 1.5, windows };
}

export const isExam = (l: Lesson) => /экзамен|зач[её]т/i.test(`${l.lesson_type ?? ""} ${l.subject}`);
