/**
 * Серия посещений и достижения «золотого профиля» (решение владельца, 11 окт 2026).
 * Сервер хранит даты и события (backend/app/services/vip_progress.py), здесь — всё,
 * что из них считается: серия, рекорд, «с нами N дней», медали и даты их получения.
 *
 * Серия — учебные дни подряд: воскресенье и будни без пар у группы (offdays) её не рвут,
 * сегодняшний день — тоже, пока не кончился. Раз в неделю (пн–вс) один пропущенный
 * учебный день спасает «заморозка».
 */

const API = process.env.NEXT_PUBLIC_API_URL!;

export interface VipProgressState {
  first_day: string | null;
  days: string[];
  offdays: string[];
  events: Record<string, string>;
}

export async function fetchVipProgress(deviceId: string, person: string, visit: boolean, flags: string[] = []): Promise<VipProgressState | null> {
  try {
    const res = await fetch(`${API}/user/vip/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, person, visit, flags }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ─── Даты (строки YYYY-MM-DD, по Душанбе) ─────────────────────────────────
const toDate = (iso: string) => new Date(iso + "T00:00:00");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
/** Понедельник недели — ключ для «одна заморозка в неделю». */
const weekKey = (s: string) => addDays(s, -((toDate(s).getDay() + 6) % 7));
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const humanDate = (s: string) => { const d = toDate(s.slice(0, 10)); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const humanStamp = (s: string) => s.length > 10 ? `${humanDate(s)}, ${Number(s.slice(11, 13))}:${s.slice(14, 16)}` : humanDate(s);

export interface StreakInfo {
  streak: number;
  best: number;
  total: number;          // дней с первого входа, включая сегодня
  frozen: Set<string>;    // дни, спасённые заморозкой
  reached: Record<number, string>; // серия впервые дошла до N — когда
}

/** Пройти все дни с первого входа по сегодня: серия, рекорд, заморозки, когда серия впервые дошла до N. */
export function computeStreak(st: VipProgressState, today: string, marks: number[]): StreakInfo {
  const visited = new Set(st.days);
  const off = new Set(st.offdays);
  const start = st.first_day ?? st.days[0] ?? today;
  const frozen = new Set<string>();
  const usedWeek = new Set<string>();
  const reached: Record<number, string> = {};
  let run = 0, best = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const sunday = toDate(d).getDay() === 0;
    if (visited.has(d)) {
      run++;
      best = Math.max(best, run);
      for (const m of marks) if (run >= m && !reached[m]) reached[m] = d;
    } else if (sunday || off.has(d) || d === today) {
      // не учебный день или сегодня ещё не кончилось — серию не трогаем
    } else if (!usedWeek.has(weekKey(d))) {
      usedWeek.add(weekKey(d));
      frozen.add(d);
    } else {
      run = 0;
    }
  }
  return { streak: run, best, total: daysBetween(start, today) + 1, frozen, reached };
}

// ─── Медали ────────────────────────────────────────────────────────────────
export type MedalIcon = "flame" | "cal" | "sun" | "moon" | "gem" | "map" | "book" | "key";
export interface Medal {
  id: string;
  group: "Серия" | "С нами" | "Особые" | "Секрет";
  icon: MedalIcon;
  name: string;
  /** Что нужно сделать (для закрытой). У секретной — нет. */
  cond: string | null;
  /** За что получено (для открытой). */
  why: string;
  tier?: 1 | 2 | 3;
  got: string | null;       // когда (YYYY-MM-DD или YYYY-MM-DDTHH:MM)
  progress?: [number, number];
}

const STREAKS: [number, string, 1 | 2 | 3][] = [[3, "Разгон", 1], [7, "Неделя в строю", 2], [14, "Две недели", 3], [30, "Железная серия", 3], [60, "Два месяца в строю", 3], [100, "Сотня", 3]];
const TOTALS: [number, string, 2 | 3][] = [[30, "Месяц с нами", 2], [90, "Три месяца", 2], [270, "Учебный год", 3]];
const EVENTS: [string, MedalIcon, string, string, string][] = [
  ["early", "sun", "Ранняя пташка", "Открыть расписание до 7:30", "Открыла расписание до 7:30"],
  ["owl", "moon", "Ночная сова", "Заглянуть в расписание после 23:00", "Заглянула в расписание после 23:00"],
  ["explorer", "map", "Исследователь", "Заглянуть во все вкладки", "Заглянула во все вкладки"],
  ["collector", "gem", "Коллекционер", "Примерить золото, платину и бриллиант", "Примерила все три металла"],
  ["names", "book", "Знаток", "Помочь узнать полное имя преподавателя", "Помогла узнать полное имя преподавателя"],
];

export function buildMedals(st: VipProgressState, s: StreakInfo): Medal[] {
  const start = st.first_day ?? st.days[0] ?? null;
  const out: Medal[] = STREAKS.map(([n, name, tier]) => ({
    id: `s${n}`, group: "Серия", icon: "flame", name, tier,
    cond: `${n} учебных дней подряд`, why: `Серия дошла до ${n} учебных дней`,
    got: s.reached[n] ?? null, progress: [Math.min(s.streak, n), n],
  }));
  for (const [n, name, tier] of TOTALS) {
    out.push({
      id: `t${n}`, group: "С нами", icon: "cal", name, tier,
      cond: `${n} дней с первого входа`, why: `${n} дней с первого входа`,
      got: start && s.total >= n ? addDays(start, n - 1) : null, progress: [Math.min(s.total, n), n],
    });
  }
  for (const [id, icon, name, cond, why] of EVENTS) {
    out.push({ id, group: "Особые", icon, name, cond, why, got: st.events[id] ?? null });
  }
  const secret = st.events.secret ?? null;
  out.push({ id: "secret", group: "Секрет", icon: "key", name: secret ? "Тайный ход" : "???", cond: null, why: "Задержала палец на своём имени", got: secret });
  return out;
}

export const medalWhen = (m: Medal) => (m.got ? humanStamp(m.got) : "");
export const todayIso = (now: Date) => iso(now);
export const STREAK_MARKS = STREAKS.map(([n]) => n);

/** Следующая медаль серии: до какого числа тянется кольцо на обороте карты. null — все собраны. */
export function nextStreakMark(streak: number): { n: number; name: string } | null {
  const next = STREAKS.find(([n]) => n > streak);
  return next ? { n: next[0], name: next[1] } : null;
}
