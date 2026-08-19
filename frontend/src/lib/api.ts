// URL бэкенда — единственный источник правды в next.config.ts (там же fallback).
const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

// Client-side cache: 3 минуты для списков, 60 сек для расписания
const _cache = new Map<string, { data: unknown; ts: number }>();

async function fetchApi<T>(path: string, ttl = 180_000): Promise<T> {
  const hit = _cache.get(path);
  if (hit && Date.now() - hit.ts < ttl) return hit.data as T;

  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data: T = await res.json();
  _cache.set(path, { data, ts: Date.now() });
  return data;
}

/** Собирает query string из объекта, пропуская undefined/null/false */
function buildQuery(params: Record<string, string | number | undefined | null | false>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? '?' + parts.join('&') : '';
}

export interface Group {
  id: number;
  name: string;
  year: number;
  faculty_code: string;
  faculty_name: string;
}

export interface Teacher {
  id: number;
  name: string;
}

export interface Lesson {
  id: number;
  subject: string;
  lesson_type: string | null;
  day_of_week: string;
  lesson_date: string | null;
  pair_number: string;
  pair_time_start: string;
  pair_time_end: string;
  teacher: { id: number; name: string } | null;
  room: { id: number; name: string } | null;
  group: { id: number; name: string; year: number; faculty_code: string | null } | null;
}

export interface TodayItem {
  pair_number: string;
  pair_time_start: string;
  pair_time_end: string;
  subject: string;
  lesson_type: string | null;
  teacher: string | null;
  room: string | null;
  group_name: string;
  is_current: boolean;
  is_next: boolean;
  minutes_until: number | null;
  /** Длина идущей сейчас перемены в минутах. null — перемены нет. */
  break_minutes: number | null;
  /** Пара не сегодня: на сегодня занятия кончились. */
  is_tomorrow: boolean;
  day_label: string | null;   // «Завтра» / «В понедельник»
}

/** Длительность по-человечески: «45 мин», «1 ч», «1 ч 45 мин». */
export function humanDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/**
 * Окно между двумя парами одного дня — то есть ПРОПУЩЕННЫЙ слот пары
 * (есть I и III, а II нет). Обычный перерыв между соседними парами,
 * включая обеденный III→IV, окном не считается.
 */
export function gapBetween(prevPair: string, nextPair: string): { pairs: string[]; minutes: number } | null {
  const i = PAIR_NUMBERS.indexOf(prevPair);
  const j = PAIR_NUMBERS.indexOf(nextPair);
  if (i < 0 || j < 0 || j - i <= 1) return null;

  const end = PAIR_TIMES[prevPair]?.[1];
  const start = PAIR_TIMES[nextPair]?.[0];
  if (!end || !start) return null;

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return { pairs: PAIR_NUMBERS.slice(i + 1, j), minutes: toMin(start) - toMin(end) };
}

/** Как назвать перерыв между парами: 15 минут, обед или «окно» на пол-дня. */
export function breakLabel(minutes: number): string {
  if (minutes <= 20) return `Перемена · ${minutes} мин`;
  if (minutes <= 90) return `Большой перерыв · ${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Окно · ${h} ч${m ? ` ${m} мин` : ""}`;
}

export interface Stats {
  faculty_code: string;
  group_name: string;
  year: number;
  total_lessons_week: number;
  lessons_by_day: Record<string, number>;
  most_loaded_day: string | null;
  unique_teachers: number;
  unique_subjects: number;
}

export interface WeekInfo {
  id: number;
  week_number: number;
  week_start: string;
  downloaded_at: string;
  is_latest: boolean;
}

export interface Change {
  id: number;
  detected_at: string;
  faculty_code: string;
  change_type: string;
  group_name: string | null;
  group_id: number | null;
  day_of_week: string | null;
  pair_number: string | null;
  old_value: string | null;
  new_value: string | null;
  week_start: string | null;
}

export const api = {
  getGroups: (facultyCode?: string) =>
    fetchApi<Group[]>(`/schedule/groups${buildQuery({ faculty_code: facultyCode })}`),

  getGroupSchedule: (groupId: number, day?: string, weekId?: number) =>
    fetchApi<Lesson[]>(`/schedule/group/${groupId}${buildQuery({ day_of_week: day, week_id: weekId })}`),

  getGroupWeeks: (groupId: number) =>
    fetchApi<WeekInfo[]>(`/schedule/weeks/${groupId}`),

  getAllWeeks: () =>
    fetchApi<Array<{ week_start: string; week_number: number; is_latest: boolean }>>('/schedule/weeks-all'),

  getTeachers: (weekStart?: string) =>
    fetchApi<Teacher[]>(`/schedule/teachers${buildQuery({ week_start: weekStart })}`),

  getTeacherSchedule: (teacherId: number, weekStart?: string) =>
    fetchApi<Lesson[]>(`/schedule/teacher/${teacherId}${buildQuery({ week_start: weekStart })}`),

  // 60 сек, а не 3 минуты по умолчанию: «идёт сейчас / перемена» устаревает быстро
  getNow: (groupId: number) =>
    fetchApi<TodayItem[]>(`/schedule/now?group_id=${groupId}`, 60_000),

  getFreeRooms: (day: string, pair: string, weekStart?: string) =>
    fetchApi<Array<{
      room_name: string; is_free: boolean; occupied_by?: string;
      occupied_list?: string[]; conflict?: boolean;
    }>>(
      `/schedule/free-rooms${buildQuery({ day_of_week: day, pair_number: pair, week_start: weekStart })}`
    ),

  getStats: (groupId: number) =>
    fetchApi<Stats>(`/schedule/stats/${groupId}`),

  getChanges: (groupId?: number) =>
    fetchApi<Change[]>(`/schedule/changes${buildQuery({ group_id: groupId })}`),

  getIcsUrl: (groupId: number) =>
    `${API_BASE}/export/ics/${groupId}`,

  // Личный кабинет
  subscribe: (sessionId: string, groupId: number) =>
    fetch(`${API_BASE}/user/subscribe?session_id=${sessionId}&group_id=${groupId}`, { method: 'POST' }).then(r => r.json()),

  getSubscription: (sessionId: string) =>
    fetchApi<{ group_id: number; group_name: string; year: number } | null>
      (`/user/subscription/${sessionId}`),

  markAttendance: (sessionId: string, lessonId: number, attended: boolean) =>
    fetch(`${API_BASE}/user/attendance?session_id=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: lessonId, attended }),
    }).then(r => r.json()),

  getAttendance: (sessionId: string) =>
    fetchApi<{ total: number; attended: number; skipped: number; rate: number; records: Array<{ lesson_id: number; attended: boolean }> }>
      (`/user/attendance/${sessionId}`),

  addNote: (sessionId: string, data: { group_id: number; day_of_week: string; pair_number: string; note: string }) =>
    fetch(`${API_BASE}/user/notes?session_id=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  getNotes: (sessionId: string) =>
    fetchApi<Array<{ id: number; group_id: number; day_of_week: string; pair_number: string; note: string }>>
      (`/user/notes/${sessionId}`),

  // Регистрация пользователя — сохраняем имя + группу на сервере
  registerUser: (deviceId: string, name: string, groupId: number) =>
    fetch(`${API_BASE}/user/register?device_id=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(name)}&group_id=${groupId}`, {
      method: 'POST',
    }).then(r => r.json()).catch(() => null),

  // Принудительная синхронизация (требует ADMIN_SECRET в заголовке)
  syncNow: (force = false, adminSecret: string) =>
    fetch(`${API_BASE}/admin/sync?force=${force}`, {
      method: 'POST',
      headers: { 'X-Admin-Secret': adminSecret },
    }).then(r => r.json()),

  // Web Push (public_key=null если пуш не настроен на сервере)
  getVapidKey: () =>
    fetchApi<{ public_key: string | null }>('/user/vapid-key'),

  savePushSubscription: (sessionId: string, groupId: number, sub: PushSubscriptionJSON) =>
    fetch(`${API_BASE}/user/push-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        group_id: groupId,
        endpoint: sub.endpoint,
        keys: sub.keys,
      }),
    }).then(r => r.json()),

  deletePushSubscription: (sessionId: string) =>
    fetch(`${API_BASE}/user/push-subscribe?session_id=${sessionId}`, {
      method: 'DELETE',
    }).then(r => r.json()),
};

export function shortGroupName(name: string): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return '';

  const n = trimmed.toUpperCase();
  if (n.includes('ПРИКЛАДНАЯ МАТЕМАТИКА') || (n.includes('МАТЕМАТИК') && n.includes('ИНФОРМАТИК'))) return 'ПМиИ';
  // Обе половины условия были одинаковыми (&& не делал ничего), из-за чего
  // ЛЮБАЯ группа со словом «физика» или «математика» становилась ХФММ.
  // Правило должно совпадать с бэкендом и мобильным.
  if (n.includes('ХИМИЯ') && (n.includes('ФИЗИКА') || n.includes('МЕХАНИКА'))) return 'ХФММ';
  if (n.includes('ГЕОЛОГИЯ')) return 'Геология';
  if (n.includes('МУНИЦИПАЛЬН') || (n.includes('ГОСУДАРСТВЕНН') && n.includes('УПРАВЛЕНИ'))) return 'ГМУ';
  if (n.includes('МЕЖДУНАРОДН') && n.includes('ОТНОШЕНИ')) return 'МО';
  if (n.includes('ЛИНГВИСТИК')) return 'Лингвистика';

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

// Имена дней недели на русском с числовым порядком
export const DAYS_ORDER = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const PAIR_NUMBERS = ['I', 'II', 'III', 'IV', 'V'];

export const PAIR_TIMES: Record<string, [string, string]> = {
  'I': ['08:00', '09:30'],
  'II': ['09:45', '11:15'],
  'III': ['11:30', '13:00'],
  'IV': ['14:00', '15:30'],
  'V': ['15:45', '17:15'],
};

// Генерация уникального session_id для гостевого пользователя
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('msu_session_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('msu_session_id', id);
  }
  return id;
}
