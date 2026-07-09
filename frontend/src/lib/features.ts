// Автооткрытие функций «Посещаемость» и «Заметки к парам».
// Раньше это был жёсткий флаг в коде (FEATURES_LOCKED) — функции НЕ открылись бы
// сами. Теперь проверка по дате: 1 сентября 2026 всё откроется автоматически,
// без редеплоя. Тот же принцип продублирован в мобильном (src/features.ts).
export const FEATURES_UNLOCK_AT = new Date("2026-09-01T00:00:00");

export function featuresUnlocked(): boolean {
  if (Date.now() >= FEATURES_UNLOCK_AT.getTime()) return true;
  // Скрытый предпросмотр для разработчика: localStorage.features_preview = "1"
  try {
    return typeof window !== "undefined" && localStorage.getItem("features_preview") === "1";
  } catch {
    return false;
  }
}
