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

/* ─────────────────────────────────────────────────────────────────────────
   Смена учебного года
   Группа в базе — это связка «направление + курс», и строка эта из года в
   год одна и та же: 1 сентября в «ПМиИ · 1 курс» оказываются пары новых
   первокурсников. Значит у всех, кто выбрал группу в прошлом учебном году,
   сохранён курс на единицу меньше нужного — и расписание они увидят чужое,
   ничего при этом не заподозрив.
   Поэтому один раз после начала года просим проверить курс.
   Ту же логику повторяет мобильное приложение (src/features.ts).
   ───────────────────────────────────────────────────────────────────────── */

/** Начало учебного года — с этого момента курс у всех сдвинулся. */
export const NEW_YEAR_AT = new Date("2026-09-01T00:00:00");

/** Когда пользователь выбрал группу. Ставится при сохранении в профиле. */
export const GROUP_CHOSEN_AT_KEY = "group_chosen_at";
/** Что подсказку уже показали и закрыли. */
export const COURSE_CHECK_DISMISSED_KEY = "course_check_dismissed";

/** Запомнить момент выбора группы — чтобы не спрашивать новичков. */
export function markGroupChosen(): void {
  localStorage.setItem(GROUP_CHOSEN_AT_KEY, new Date().toISOString());
}

/**
 * Пора ли попросить проверить курс.
 *
 * Спрашиваем только тех, кто выбирал группу ДО начала учебного года: у
 * новичков, поставивших приложение в сентябре, курс заведомо верный, и
 * подсказка была бы шумом. Отсутствие отметки = выбирал давно, до того как
 * мы начали её ставить.
 */
export function shouldAskCourseCheck(): boolean {
  if (typeof window === "undefined") return false;
  if (Date.now() < NEW_YEAR_AT.getTime()) return false;
  if (localStorage.getItem(COURSE_CHECK_DISMISSED_KEY) === "1") return false;
  const chosenAt = localStorage.getItem(GROUP_CHOSEN_AT_KEY);
  if (!chosenAt) return true;
  return new Date(chosenAt).getTime() < NEW_YEAR_AT.getTime();
}
