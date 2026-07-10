// «Посещаемость» и «Заметки к парам» закрыты до 1 сентября 2026, 00:00.
// Открываются автоматически по дате устройства — без редеплоя и обновлений.
// Тот же принцип продублирован в мобильном (src/features.ts).
export const FEATURES_UNLOCK_AT = new Date("2026-09-01T00:00:00");

export function featuresUnlocked(): boolean {
  return Date.now() >= FEATURES_UNLOCK_AT.getTime();
}

/** Сколько полных дней осталось до открытия (для обратного отсчёта в кабинете). */
export function daysUntilUnlock(): number {
  return Math.max(0, Math.ceil((FEATURES_UNLOCK_AT.getTime() - Date.now()) / 86_400_000));
}
