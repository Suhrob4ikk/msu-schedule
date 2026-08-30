// URL бэкенда — единственный источник правды в next.config.ts (там же fallback).
const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

/** Origin бэкенда — для <link rel="preconnect"> в layout.tsx. */
export const API_ORIGIN = (() => {
  try { return new URL(API_BASE).origin; } catch { return ''; }
})();

// ─── Кэш ответов API ─────────────────────────────────────────────────────────
//
// Два уровня:
//   1) память       — живёт, пока открыта вкладка; переходы между страницами мгновенные;
//   2) localStorage — переживает перезагрузку и запуск PWA. Именно он спасает
//      от холодного старта Render (до 50 сек на первый запрос): экран рисуется
//      сразу по сохранённым данным, а свежие подъезжают в фоне.
//
// Стратегия — stale-while-revalidate:
//   свежее (моложе ttl)  → отдаём сразу, сеть не трогаем;
//   протухшее            → отдаём сразу И параллельно обновляем в фоне;
//   ничего нет           → ждём сеть; если сеть упала — отдаём протухшее любого возраста.
//
// Так офлайн-режим работает без сети, а онлайн не показывает пустой экран.

type Entry = { data: unknown; ts: number };

const _mem = new Map<string, Entry>();
const _inflight = new Map<string, Promise<unknown>>();

const LS_PREFIX = 'msu_api_v1:';
/** Данные старше недели не показываем даже в офлайне — это уже другое расписание. */
const PERSIST_MAX_AGE = 7 * 24 * 3600_000;
/** Больше 400 КБ в localStorage не кладём: квота ~5 МБ на весь домен. */
const PERSIST_MAX_BYTES = 400_000;
/** Сколько ответов держим в localStorage; лишние вытесняются по давности. */
const PERSIST_MAX_ENTRIES = 60;

// Без тайм-аута fetch на плохой сети мог висеть бесконечно — ни ошибки,
// ни повторной попытки, страница просто не показывает содержимое.
const FETCH_TIMEOUT_MS = 15_000;
// Render на бесплатном тарифе просыпается до 50 сек. Один повтор с длинным
// тайм-аутом — только если показать нечего (кэша нет), иначе ждать незачем.
const COLD_START_TIMEOUT_MS = 40_000;

const hasLS = () => typeof window !== 'undefined' && !!window.localStorage;

function readPersisted(path: string): Entry | undefined {
  if (!hasLS()) return undefined;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + path);
    if (!raw) return undefined;
    const e = JSON.parse(raw) as Entry;
    if (!e || typeof e.ts !== 'number') return undefined;
    if (Date.now() - e.ts > PERSIST_MAX_AGE) {
      window.localStorage.removeItem(LS_PREFIX + path);
      return undefined;
    }
    return e;
  } catch {
    return undefined;
  }
}

/** Вытесняет самые старые записи кэша — когда их слишком много или кончилась квота. */
function evictPersisted(keep = PERSIST_MAX_ENTRIES): void {
  if (!hasLS()) return;
  try {
    const keys: Array<{ k: string; ts: number }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      let ts = 0;
      // Битая запись получит ts=0 и вылетит первой — так и надо.
      try { ts = (JSON.parse(window.localStorage.getItem(k) || '{}') as Entry).ts || 0; } catch { ts = 0; }
      keys.push({ k, ts });
    }
    keys.sort((a, b) => a.ts - b.ts);
    for (const { k } of keys.slice(0, Math.max(0, keys.length - keep))) {
      window.localStorage.removeItem(k);
    }
  } catch { /* квота/приватный режим — переживём и без кэша */ }
}

function writePersisted(path: string, entry: Entry): void {
  if (!hasLS()) return;
  let raw: string;
  try { raw = JSON.stringify(entry); } catch { return; }
  if (raw.length > PERSIST_MAX_BYTES) return;
  try {
    window.localStorage.setItem(LS_PREFIX + path, raw);
  } catch {
    // Квота кончилась — чистим половину и пробуем ещё раз, один раз.
    evictPersisted(Math.floor(PERSIST_MAX_ENTRIES / 2));
    try { window.localStorage.setItem(LS_PREFIX + path, raw); } catch { /* не влезло — не беда */ }
  }
}

function getEntry(path: string, volatile: boolean): Entry | undefined {
  const hit = _mem.get(path);
  if (hit) return hit;
  if (volatile) return undefined;          // «идёт сейчас» из прошлой сессии показывать нельзя
  const persisted = readPersisted(path);
  if (persisted) _mem.set(path, persisted);
  return persisted;
}

function putEntry(path: string, data: unknown, volatile: boolean): void {
  const entry = { data, ts: Date.now() };
  _mem.set(path, entry);
  if (!volatile) writePersisted(path, entry);
}

// ─── Подписка на фоновое обновление ──────────────────────────────────────────
// Страница отрисовалась по кэшу, в фоне пришли новые данные — сообщаем ей,
// чтобы она молча перечитала (все чтения к этому моменту уже свежие, сети не будет).

type UpdateListener = (path: string) => void;
const _listeners = new Set<UpdateListener>();

/** Подписка на «в кэше появились новые данные». Возвращает функцию отписки. */
export function onApiUpdate(fn: UpdateListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function emitUpdate(path: string): void {
  for (const fn of _listeners) {
    try { fn(path); } catch { /* слушатель не должен ломать загрузку */ }
  }
}

// ─── Сам запрос ──────────────────────────────────────────────────────────────

async function rawFetch<T>(path: string, timeout: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

const isTimeout = (e: unknown) => e instanceof Error && e.name === 'AbortError';

/**
 * Одна сетевая попытка на путь: если два компонента спросили одно и то же
 * одновременно, запрос уйдёт один, а ответ получат оба.
 */
function revalidate<T>(path: string, volatile: boolean, allowRetry: boolean): Promise<T> {
  const running = _inflight.get(path);
  if (running) return running as Promise<T>;

  const p = (async () => {
    try {
      return await rawFetch<T>(path, FETCH_TIMEOUT_MS);
    } catch (e) {
      // Тайм-аут при пустом кэше — почти всегда просыпающийся Render. Ждём дольше.
      if (allowRetry && isTimeout(e)) return await rawFetch<T>(path, COLD_START_TIMEOUT_MS);
      throw e;
    }
  })()
    .then(data => {
      const prev = _mem.get(path);
      putEntry(path, data, volatile);
      // Сообщаем страницам, только когда данные реально изменились —
      // иначе фоновое обновление дёргало бы перерисовку впустую.
      if (prev && JSON.stringify(prev.data) !== JSON.stringify(data)) emitUpdate(path);
      return data as T;
    })
    .finally(() => { _inflight.delete(path); });

  _inflight.set(path, p);
  return p;
}

async function fetchApi<T>(path: string, ttl = 180_000, volatile = false): Promise<T> {
  const entry = getEntry(path, volatile);

  // 1. Свежее — отдаём сразу, в сеть не идём.
  if (entry && Date.now() - entry.ts < ttl) return entry.data as T;

  // 2. Протухшее — отдаём сразу, обновляем в фоне (stale-while-revalidate).
  if (entry) {
    revalidate<T>(path, volatile, false).catch(() => { /* нет сети — остаёмся на кэше */ });
    return entry.data as T;
  }

  // 3. Показать нечего — ждём сеть.
  try {
    return await revalidate<T>(path, volatile, true);
  } catch (e) {
    // Сеть упала, но сохранённое есть (например, память пуста после перезагрузки) —
    // отдаём его: офлайн-режим важнее свежести.
    const fallback = volatile ? undefined : readPersisted(path);
    if (fallback) return fallback.data as T;
    if (isTimeout(e)) throw new Error('Сервер не отвечает — проверьте соединение');
    throw e;
  }
}

/** Прогреть кэш заранее, не мешая отрисовке. Ошибки игнорируются. */
export function prefetch(path: string, ttl = 180_000): void {
  fetchApi(path, ttl).catch(() => { /* прогрев — необязательная операция */ });
}

/** Полный сброс кэша: ручное обновление должно тянуть свежие данные. */
export function clearApiCache(): void {
  _mem.clear();
  if (!hasLS()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    keys.forEach(k => window.localStorage.removeItem(k));
  } catch { /* нет доступа к localStorage — память уже очищена */ }
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

/**
 * Утренний пробел, если день начинается не с первой пары — например, среда
 * сразу со второй. Без этого первая карточка дня выглядела как обычная
 * пара номер один, и было непонятно, что к началу первой пары ехать не нужно.
 * Использует ту же логику, что gapBetween, только точкой отсчёта служит
 * начало дня (I пара), а не предыдущее занятие — его в этот день просто нет.
 * Дублируется в мобильном src/api.ts.
 */
export function leadingGap(firstPair: string): { pairs: string[]; minutes: number } | null {
  const j = PAIR_NUMBERS.indexOf(firstPair);
  if (j <= 0) return null;

  const dayStart = PAIR_TIMES[PAIR_NUMBERS[0]]?.[0];
  const start = PAIR_TIMES[firstPair]?.[0];
  if (!dayStart || !start) return null;

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return { pairs: PAIR_NUMBERS.slice(0, j), minutes: toMin(start) - toMin(dayStart) };
}

/**
 * Какая пара идёт прямо сейчас — для кнопки «свободно сейчас».
 *
 * Если пара идёт — возвращаем её; если сейчас перемена или утро — ближайшую
 * следующую сегодня. Вечером и в воскресенье возвращаем null: показывать
 * «свободно сейчас» уже нечего, занятий в этот момент нет.
 * Дублируется в мобильном src/api.ts.
 */
export function currentSlot(now = new Date()): { day: string; pair: string } | null {
  const jsDay = now.getDay();               // 0=вс … 6=сб
  if (jsDay === 0) return null;             // воскресенье — пар нет
  const day = DAYS_ORDER[jsDay - 1];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  for (const pair of PAIR_NUMBERS) {
    // Идёт сейчас — или ещё не началась (значит, ближайшая)
    if (minutes <= toMin(PAIR_TIMES[pair][1])) return { day, pair };
  }
  return null;                              // занятия на сегодня кончились
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

/**
 * TTL — «сколько ответ считается свежим». Если он протух, страница всё равно
 * получает данные мгновенно из кэша, а сеть спрашивается в фоне (см. fetchApi).
 * Бэкенд синхронизируется с msu.tj раз в 2 часа, поэтому минуты роли не играют.
 */
const TTL_LONG = 30 * 60_000;   // списки: группы, недели
const TTL_DATA = 10 * 60_000;   // расписания, преподаватели, аудитории
const TTL_FEED = 3 * 60_000;    // лента изменений
const TTL_NOW  = 60_000;        // «идёт сейчас» — устаревает быстро

/** Пути, на обновление которых подписываются страницы (см. onApiUpdate). */
export const paths = {
  groups: (facultyCode?: string) => `/schedule/groups${buildQuery({ faculty_code: facultyCode })}`,
  groupSchedule: (groupId: number, day?: string, weekId?: number) =>
    `/schedule/group/${groupId}${buildQuery({ day_of_week: day, week_id: weekId })}`,
  groupWeeks: (groupId: number) => `/schedule/weeks/${groupId}`,
  teachers: (weekStart?: string) => `/schedule/teachers${buildQuery({ week_start: weekStart })}`,
  changes: (groupId?: number) => `/schedule/changes${buildQuery({ group_id: groupId })}`,
};

export const api = {
  getGroups: (facultyCode?: string) =>
    fetchApi<Group[]>(paths.groups(facultyCode), TTL_LONG),

  getGroupSchedule: (groupId: number, day?: string, weekId?: number) =>
    fetchApi<Lesson[]>(paths.groupSchedule(groupId, day, weekId), TTL_DATA),

  getGroupWeeks: (groupId: number) =>
    fetchApi<WeekInfo[]>(paths.groupWeeks(groupId), TTL_LONG),

  getAllWeeks: () =>
    fetchApi<Array<{ week_start: string; week_number: number; is_latest: boolean }>>('/schedule/weeks-all', TTL_LONG),

  getTeachers: (weekStart?: string) =>
    fetchApi<Teacher[]>(paths.teachers(weekStart), TTL_DATA),

  getTeacherSchedule: (teacherId: number, weekStart?: string) =>
    fetchApi<Lesson[]>(`/schedule/teacher/${teacherId}${buildQuery({ week_start: weekStart })}`, TTL_DATA),

  // volatile: «идёт сейчас / перемена» привязано к текущей минуте — из прошлой
  // сессии такой ответ показывать нельзя, поэтому в localStorage он не пишется.
  getNow: (groupId: number) =>
    fetchApi<TodayItem[]>(`/schedule/now?group_id=${groupId}`, TTL_NOW, true),

  getFreeRooms: (day: string, pair: string, weekStart?: string) =>
    fetchApi<Array<{
      room_name: string; is_free: boolean; occupied_by?: string;
      occupied_list?: string[]; conflict?: boolean;
    }>>(
      `/schedule/free-rooms${buildQuery({ day_of_week: day, pair_number: pair, week_start: weekStart })}`,
      TTL_DATA,
    ),

  getStats: (groupId: number) =>
    fetchApi<Stats>(`/schedule/stats/${groupId}`, TTL_DATA),

  getChanges: (groupId?: number) =>
    fetchApi<Change[]>(paths.changes(groupId), TTL_FEED),

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

  // Ручной запуск синхронизации здесь не держим: это единственное место, куда
  // просился бы ADMIN_SECRET, а всё, что попало в клиентский код веба,
  // попадает и в браузер пользователя. Синхронизация запускается из скрытой
  // панели /dev по её собственному токену (см. app/dev/page.tsx).

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
