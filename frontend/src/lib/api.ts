const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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
  day_of_week: string | null;
  pair_number: string | null;
  old_value: string | null;
  new_value: string | null;
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

  getNow: (groupId: number) =>
    fetchApi<TodayItem[]>(`/schedule/now?group_id=${groupId}`),

  getFreeRooms: (day: string, pair: string) =>
    fetchApi<Array<{ room_name: string; is_free: boolean; occupied_by?: string }>>
      (`/schedule/free-rooms?day_of_week=${encodeURIComponent(day)}&pair_number=${pair}`),

  getStats: (groupId: number) =>
    fetchApi<Stats>(`/schedule/stats/${groupId}`),

  getChanges: () =>
    fetchApi<Change[]>('/schedule/changes'),

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

  // Принудительная синхронизация (требует ADMIN_SECRET в заголовке)
  syncNow: (force = false, adminSecret: string) =>
    fetch(`${API_BASE}/admin/sync?force=${force}`, {
      method: 'POST',
      headers: { 'X-Admin-Secret': adminSecret },
    }).then(r => r.json()),
};

// Имена дней недели на русском с числовым порядком
export const DAYS_ORDER = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const PAIR_NUMBERS = ['I', 'II', 'III', 'IV', 'V'];

export const PAIR_TIMES: Record<string, [string, string]> = {
  'I':   ['08:00', '09:30'],
  'II':  ['09:45', '11:15'],
  'III': ['11:30', '13:00'],
  'IV':  ['14:00', '15:30'],
  'V':   ['15:45', '17:15'],
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
