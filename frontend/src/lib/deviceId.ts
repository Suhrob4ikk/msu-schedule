// Номер устройства (msu_device_id_v2) и его сохранение в трёх местах сразу (владелец, 26 окт 2026:
// «воздержаться от двойников, если человек заходит с того же устройства заново»).
//
// Сервер знает человека по этому номеру. Раньше он жил только в localStorage — и пропадал, когда
// браузер чистил память сайта (iPhone делает это сам, если сайтом неделю не пользовались): человек
// получал новый номер и становился «двойником». Теперь тот же номер лежит ещё в cookie (400 дней) и
// в IndexedDB; если localStorage пуст, номер берётся оттуда. Разные браузеры и встроенные браузеры
// (Telegram, Instagram) всё равно остаются разными устройствами — это сайт отличить не может.

export const DEVICE_KEY = "msu_device_id_v2";
const COOKIE = "msu_did";
const IDB_NAME = "msu_device";
const IDB_STORE = "kv";

/** Ранний скрипт для <head>: cookie ↔ localStorage, синхронно, до остального кода. */
export function deviceIdInitScript(): string {
  return `(function(){try{var L=localStorage,k='${DEVICE_KEY}',c=document.cookie.match(/(?:^|; )${COOKIE}=([^;]+)/),v=L.getItem(k);if(!v&&c){L.setItem(k,decodeURIComponent(c[1]))}else if(v&&(!c||decodeURIComponent(c[1])!==v)){document.cookie='${COOKIE}='+encodeURIComponent(v)+'; max-age=34560000; path=/; SameSite=Lax'}}catch(e){}})();`;
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(IDB_STORE); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function idbGet(): Promise<string | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const q = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(DEVICE_KEY);
      q.onsuccess = () => resolve(typeof q.result === "string" ? q.result : null);
      q.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function idbPut(id: string): Promise<void> {
  const db = await idb();
  if (!db) return;
  try { db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(id, DEVICE_KEY); } catch { /* нет места или запрет */ }
}

function writeAll(id: string) {
  try { localStorage.setItem(DEVICE_KEY, id); } catch { /* приватный режим */ }
  try { document.cookie = `${COOKIE}=${encodeURIComponent(id)}; max-age=34560000; path=/; SameSite=Lax`; } catch { /* cookie выключены */ }
  void idbPut(id);
}

/** При запуске сайта: если номер есть где-то одном — раскладываем по всем трём. Ничего не создаёт. */
export async function syncDeviceId(): Promise<void> {
  let id: string | null = null;
  try { id = localStorage.getItem(DEVICE_KEY); } catch { /* приватный режим */ }
  if (!id) id = await idbGet();
  if (id) writeAll(id);
}

/** Номер для регистрации: есть — берём (localStorage, потом IndexedDB), нет — создаём и кладём во все три места. */
export async function ensureDeviceId(): Promise<string> {
  let id: string | null = null;
  try { id = localStorage.getItem(DEVICE_KEY); } catch { /* приватный режим */ }
  if (!id) id = await idbGet();
  if (!id) id = crypto.randomUUID();
  writeAll(id);
  return id;
}
