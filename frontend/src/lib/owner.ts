// Устройство владельца (11 окт 2026): ключ в localStorage и инлайн-скрипт для layout.tsx.
// Без "use client" — скрипт вшивается на сервере. Сама проверка — components/OwnerSync.tsx.

export const OWNER_KEY = "owner_device";

/** Ставит класс `owner` на <html> до первой отрисовки, если прошлый ответ сервера был «да». */
export function ownerInitScript(): string {
  return `(function(){try{if(localStorage.getItem('${OWNER_KEY}')==='1')document.documentElement.classList.add('owner')}catch(e){}})();`;
}
