// Особые настройки для отдельных пользователей — по решению владельца (10 окт 2026).
//
// Узнаём двумя способами, хватает любого:
// 1. по устройству — номеру из localStorage `msu_device_id_v2` (его же сайт шлёт
//    в /user/register);
// 2. по личному коду — человек вводит его в Кабинете («Есть код?») или открывает
//    ссылку `/?code=…`; код запоминается в localStorage `vip_code`. Так профиль
//    переживает очистку браузера и новый телефон.
// В код сайта кладём не сами номер и код, а их отпечатки cyrb53: бандл публичный.
// Отпечаток устройства — cyrb53(device_id), кода — cyrb53("vip:" + КОД), см. ниже.
// Сам код владелец знает и передаёт лично; в репозитории его нет.
//
// Тексты — шутливые, в стиле «уведомления от администрации», без романтики (решение владельца).

export interface VipInfo {
  /** Имя на золотой карте. */
  name: string;
  /** Подпись под именем на карте. */
  role: string;
  /** Номер карты. */
  number: string;
  /** Дата регистрации — «С нами с …». */
  since: string;
  /** Ключ на сервере (services/vip_progress.py → PEOPLE): серия и достижения. */
  id: string;
  /** День рождения «MM-DD» — праздничный показ и конфетти весь день. null — не знаем. */
  birthday: string | null;
}

// firstName — код действует, только если в Кабинете имя начинается с этого слова
// (решение владельца: «код только для Шахзоды»). Устройство узнаётся и без имени.
interface Person { devices: string[]; code: string; firstName: string; info: VipInfo }

// Шахзода, ПМиИ 3 курс (регистрация №169): шрифт Roboto Condensed и «золотой профиль» —
// приветствие, золотая рамка у идущей пары, золотая карта, отзыв.
const PEOPLE: Person[] = [
  {
    devices: ["vo32m1a4y2"],
    code: "qguwyk5mr5",
    firstName: "шахзода",
    info: { name: "Шахзода", role: "Подружка админа", number: "001", since: "9 октября 2026", id: "shahzoda", birthday: "08-10" },
  },
];

export function cyrb53(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const CODE_KEY = "vip_code";
const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const codeHash = (s: string) => cyrb53("vip:" + normCode(s));
/** «Шахзода 🤪» → «шахзода»: первое слово имени, только буквы. */
const firstWord = (name: string | null) =>
  (name ?? "").trim().split(/\s+/)[0].toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я]/g, "");

/** Особый ли этот браузер. Только в браузере и после монтирования (см. useVip). */
export function readVip(): VipInfo | null {
  try {
    const id = localStorage.getItem("msu_device_id_v2");
    const code = localStorage.getItem(CODE_KEY);
    const name = firstWord(localStorage.getItem("user_name"));
    const dh = id ? cyrb53(id) : null;
    const ch = code ? codeHash(code) : null;
    return PEOPLE.find(p => (dh && p.devices.includes(dh)) || (ch && p.code === ch && p.firstName === name))?.info ?? null;
  } catch {
    return null;
  }
}

/** Показывать ли «Активировать профиль»: только тем, чьё имя в Кабинете начинается
 *  как у особого (решение владельца, как ссылка на /dev у «Сухроб»). Не защита — та в коде. */
export function canActivateVip(name: string): boolean {
  const n = firstWord(name);
  return !!n && PEOPLE.some(p => p.firstName === n);
}

/** Ввели код: подошёл и имя в Кабинете то же — запоминаем и возвращаем true. */
export function applyVipCode(input: string): boolean {
  const h = codeHash(input);
  let name = "";
  try { name = firstWord(localStorage.getItem("user_name")); } catch { return false; }
  if (!normCode(input) || !PEOPLE.some(p => p.code === h && p.firstName === name)) return false;
  try { localStorage.setItem(CODE_KEY, normCode(input)); } catch { return false; }
  return true;
}

// Ставит на <html> классы `font-condensed` и `vip` до первой отрисовки — без мигания
// шрифта и рамки. Тот же cyrb53, что выше, только в одну строку. Заодно принимает
// ссылку `?code=…`: верный код запоминается, и адрес чистится от него. Код
// включает профиль, только если и имя в Кабинете совпадает (см. firstName).
export function specialInitScript(): string {
  const devices = JSON.stringify(PEOPLE.flatMap(p => p.devices));
  const codes = JSON.stringify(PEOPLE.map(p => p.code));
  const names = JSON.stringify(PEOPLE.map(p => p.firstName));
  return `(function(){try{function H(s){var h1=0xdeadbeef,h2=0x41c6ce57;for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677)}h1=Math.imul(h1^(h1>>>16),2246822507);h1^=Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507);h2^=Math.imul(h1^(h1>>>13),3266489909);return(4294967296*(2097151&h2)+(h1>>>0)).toString(36)}var N=function(s){return(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')},C=${codes},L=localStorage,u=new URL(location.href),q=u.searchParams.get('code');if(q!==null){if(C.indexOf(H('vip:'+N(q)))>=0)L.setItem('${CODE_KEY}',N(q));u.searchParams.delete('code');history.replaceState(null,'',u.pathname+u.search+u.hash)}var s=L.getItem('msu_device_id_v2'),k=L.getItem('${CODE_KEY}'),n=(L.getItem('user_name')||'').trim().split(/\\s+/)[0].toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я]/g,''),j=k?C.indexOf(H('vip:'+N(k))):-1;if((s&&${devices}.indexOf(H(s))>=0)||(j>=0&&${names}[j]===n))document.documentElement.classList.add('font-condensed','vip')}catch(e){}})();`;
}

/** Металлы (золото, бриллиант, платина) — «свой цвет» в формате оформления, только у особых (значения — lib/appearance.ts). */
export { GOLD_ACCENT, METALS, METAL_IDS, metalOf, type MetalId } from "./appearance";

// Что особый пользователь уже посмотрел. Ключи — только в его браузере.
// Сюрприз «ещё два оформления» показан; метка «Новое» на «Внешнем виде», пока туда не зашла.
export const VIP_SURPRISE_KEY = "vip_surprise_metals_v1";
export const VIP_NEW_KEY = "vip_new_metals";
// Серия и достижения (VipTracker, lib/vipProgress.ts)
export const VIP_VISIT_KEY = "vip_visit_day";        // день последней отметки
export const VIP_FLAGS_KEY = "vip_flags_sent";       // события, уже отправленные на сервер
export const VIP_TABS_KEY = "vip_tabs_seen";         // вкладки, где побывала («Исследователь»)
export const VIP_METALS_KEY = "vip_metals_tried";    // примеренные металлы («Коллекционер»)
// Сезонные эффекты: auto | winter | spring | autumn | off (выбор во «Внешнем виде»)
export const VIP_SEASON_KEY = "vip_season";
// Праздничный показ в день рождения — один раз в году: ключ + год
export const VIP_BDAY_KEY = "vip_bday_shown";
// Только для проверки владельцем: «1» — сегодня как будто день рождения
export const VIP_BDAY_TEST_KEY = "vip_bday_test";

/** Сегодня (по часам Душанбе, now = dushanbeNow()) её день рождения. Для проверки
 *  владельцем — ключ VIP_BDAY_TEST_KEY = «1» в браузере. */
export function isVipBirthday(vip: VipInfo, now: Date): boolean {
  try { if (localStorage.getItem(VIP_BDAY_TEST_KEY) === "1") return true; } catch { /* приватный режим */ }
  if (!vip.birthday) return false;
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return vip.birthday === mmdd;
}

export type VipSeason = "auto" | "winter" | "spring" | "autumn" | "off";
export function readVipSeason(): VipSeason {
  try {
    const v = localStorage.getItem(VIP_SEASON_KEY);
    return v === "winter" || v === "spring" || v === "autumn" || v === "off" ? v : "auto";
  } catch { return "auto"; }
}
/** Какой сезон показывать сейчас: «авто» — по месяцу (дек–фев зима, мар–май весна,
 *  сен–ноя осень, летом ничего). null — ничего не показывать. */
export function activeSeason(choice: VipSeason, now: Date): "winter" | "spring" | "autumn" | null {
  if (choice === "off") return null;
  if (choice !== "auto") return choice;
  const m = now.getMonth();
  return m === 11 || m <= 1 ? "winter" : m <= 4 ? "spring" : m >= 8 && m <= 10 ? "autumn" : null;
}
