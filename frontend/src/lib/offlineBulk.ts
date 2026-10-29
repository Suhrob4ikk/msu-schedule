// Полный офлайн сайта (владелец, 29 окт 2026: «без сети сайт открывает только расписание своей группы, а в приложении
// работает всё»). Раньше без сети были доступны только страницы, которые человек уже открывал: чужая группа, педагог,
// аудитории — «Нет подключения». Теперь сайт, как и приложение, раз в несколько часов скачивает всё расписание одним
// ответом (/schedule/bulk-sync, по сети ~40 КБ сжатым, ~1,7 МБ в разобранном виде), кладёт его в IndexedDB
// (localStorage мал для такого размера) и, когда сеть не отвечает, собирает ответы на обычные запросы из него.
//
// Ключи в bulk-sync те же, что в мобильном приложении (src/api.ts → SyncContext): schedules «группа_неделя», teacher_schedules
// «педагог_понедельник», free_rooms «день_пара_понедельник». «Изменения» и «идёт сейчас» в него не входят — они без сети
// и раньше показывали сохранённое.

const DB_NAME = "msu_offline";
const STORE = "kv";
const KEY = "bulk";
/** Не скачивать заново чаще, чем раз в 6 часов. */
export const BULK_MAX_AGE_MS = 6 * 3600 * 1000;

interface Bulk {
  groups: Array<{ id: number; faculty_code?: string }>;
  weeks_all: unknown[];
  group_weeks: Record<string, Array<{ id: number; is_latest?: boolean }>>;
  schedules: Record<string, Array<{ day_of_week?: string }>>;
  teachers_by_week: Record<string, unknown[]>;
  teacher_schedules: Record<string, unknown[]>;
  free_rooms: Record<string, unknown[]>;
}
interface Stored { ts: number; data: Bulk }

let _memo: Stored | null | undefined;

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function readStored(): Promise<Stored | null> {
  if (_memo !== undefined) return _memo;
  const db = await open();
  if (!db) return (_memo = null);
  return new Promise(resolve => {
    try {
      const q = db.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => resolve((_memo = (q.result as Stored | undefined) ?? null));
      q.onerror = () => resolve((_memo = null));
    } catch { resolve((_memo = null)); }
  });
}

async function writeStored(s: Stored): Promise<void> {
  _memo = s;
  const db = await open();
  if (!db) return;
  try { db.transaction(STORE, "readwrite").objectStore(STORE).put(s, KEY); } catch { /* нет места — офлайна не будет, онлайн работает */ }
}

/** Скачивает всё расписание и сохраняет, если сохранённое старше BULK_MAX_AGE_MS. Ошибки молча игнорируются. */
export async function warmBulk(fetchBulk: () => Promise<unknown>): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const cur = await readStored();
    if (cur && Date.now() - cur.ts < BULK_MAX_AGE_MS) return;
    const data = (await fetchBulk()) as Bulk;
    if (!data || !data.schedules || !data.groups) return;
    await writeStored({ ts: Date.now(), data });
  } catch { /* нет сети — остаёмся на сохранённом */ }
}

/** Понедельник этой недели (YYYY-MM-DD) — какую неделю брать, если в запросе её нет. */
function thisMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pickWeek(keys: string[], asked: string | null): string | undefined {
  if (asked && keys.includes(asked)) return asked;
  const mon = thisMonday();
  if (keys.includes(mon)) return mon;
  return [...keys].sort().pop();
}

/** Ответ на обычный запрос сайта из сохранённого bulk-sync; undefined — не знаем (или ничего не сохранено). */
export async function offlineAnswer(path: string): Promise<unknown | undefined> {
  const stored = await readStored();
  if (!stored) return undefined;
  const b = stored.data;
  let u: URL;
  try { u = new URL(path, "http://offline.local"); } catch { return undefined; }
  const p = u.pathname.replace(/\/+$/, "");
  const q = u.searchParams;

  if (p === "/schedule/groups") {
    const fac = q.get("faculty_code");
    return fac ? b.groups.filter(g => g.faculty_code === fac) : b.groups;
  }
  if (p === "/schedule/weeks-all") return b.weeks_all;

  let m = p.match(/^\/schedule\/weeks\/(\d+)$/);
  if (m) return b.group_weeks[m[1]];

  m = p.match(/^\/schedule\/group\/(\d+)$/);
  if (m) {
    const gid = m[1];
    let weekId = q.get("week_id");
    if (!weekId) {
      const ws = b.group_weeks[gid] ?? [];
      const w = ws.find(x => x.is_latest) ?? ws[0];
      if (!w) return undefined;
      weekId = String(w.id);
    }
    const all = b.schedules[`${gid}_${weekId}`];
    if (!all) return undefined;
    const day = q.get("day_of_week");
    return day ? all.filter(l => l.day_of_week === day) : all;
  }

  if (p === "/schedule/teachers") {
    const ws = pickWeek(Object.keys(b.teachers_by_week), q.get("week_start"));
    return ws ? b.teachers_by_week[ws] : undefined;
  }

  m = p.match(/^\/schedule\/teacher\/(\d+)$/);
  if (m) {
    const keys = Object.keys(b.teacher_schedules).filter(k => k.startsWith(`${m![1]}_`)).map(k => k.slice(m![1].length + 1));
    const ws = pickWeek(keys, q.get("week_start"));
    return ws ? b.teacher_schedules[`${m[1]}_${ws}`] : undefined;
  }

  if (p === "/schedule/free-rooms") {
    const day = q.get("day_of_week"), pair = q.get("pair_number");
    if (!day || !pair) return undefined;
    const keys = Object.keys(b.free_rooms).filter(k => k.startsWith(`${day}_${pair}_`)).map(k => k.slice(`${day}_${pair}_`.length));
    const ws = pickWeek(keys, q.get("week_start"));
    return ws ? b.free_rooms[`${day}_${pair}_${ws}`] : undefined;
  }
  return undefined;
}
