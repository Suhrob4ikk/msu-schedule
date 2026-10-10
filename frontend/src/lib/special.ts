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
}

interface Person { devices: string[]; code: string; info: VipInfo }

// Шахзода, ПМиИ 3 курс (регистрация №169): шрифт Roboto Condensed и «золотой профиль» —
// торжественное открытие, приветствие, золотая рамка у идущей пары, карта, письмо, отзыв.
const PEOPLE: Person[] = [
  {
    devices: ["vo32m1a4y2"],
    code: "qguwyk5mr5",
    info: { name: "Шахзода", role: "Подружка админа", number: "001", since: "9 октября 2026" },
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

/** Особый ли этот браузер. Только в браузере и после монтирования (см. useVip). */
export function readVip(): VipInfo | null {
  try {
    const id = localStorage.getItem("msu_device_id_v2");
    const code = localStorage.getItem(CODE_KEY);
    const dh = id ? cyrb53(id) : null;
    const ch = code ? codeHash(code) : null;
    return PEOPLE.find(p => (dh && p.devices.includes(dh)) || (ch && p.code === ch))?.info ?? null;
  } catch {
    return null;
  }
}

/** Ввели код: подошёл — запоминаем и возвращаем true. */
export function applyVipCode(input: string): boolean {
  const h = codeHash(input);
  if (!normCode(input) || !PEOPLE.some(p => p.code === h)) return false;
  try { localStorage.setItem(CODE_KEY, normCode(input)); } catch { return false; }
  return true;
}

// Ставит на <html> классы `font-condensed` и `vip` до первой отрисовки — без мигания
// шрифта и рамки. Тот же cyrb53, что выше, только в одну строку. Заодно принимает
// ссылку `?code=…`: верный код запоминается, и адрес чистится от него.
export function specialInitScript(): string {
  const devices = JSON.stringify(PEOPLE.flatMap(p => p.devices));
  const codes = JSON.stringify(PEOPLE.map(p => p.code));
  return `(function(){try{function H(s){var h1=0xdeadbeef,h2=0x41c6ce57;for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677)}h1=Math.imul(h1^(h1>>>16),2246822507);h1^=Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507);h2^=Math.imul(h1^(h1>>>13),3266489909);return(4294967296*(2097151&h2)+(h1>>>0)).toString(36)}var N=function(s){return(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')},C=${codes},L=localStorage,u=new URL(location.href),q=u.searchParams.get('code');if(q!==null){if(C.indexOf(H('vip:'+N(q)))>=0)L.setItem('${CODE_KEY}',N(q));u.searchParams.delete('code');history.replaceState(null,'',u.pathname+u.search+u.hash)}var s=L.getItem('msu_device_id_v2'),k=L.getItem('${CODE_KEY}');if((s&&${devices}.indexOf(H(s))>=0)||(k&&C.indexOf(H('vip:'+N(k)))>=0))document.documentElement.classList.add('font-condensed','vip')}catch(e){}})();`;
}

/** Золотой акцент — «свой цвет» в формате оформления, только у особых. */
export const GOLD_ACCENT = "#C9A227";

// Что особый пользователь уже посмотрел. Ключи — только в его браузере.
export const VIP_INTRO_KEY = "vip_intro_seen_v1";
export const VIP_TASKS_KEY = "vip_tasks_v1";
