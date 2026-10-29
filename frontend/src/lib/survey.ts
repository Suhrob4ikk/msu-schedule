// Опрос «Помогите улучшить» (CustDev; владелец, 29 окт 2026). Анонимный: имя и группа не уходят,
// сервер хранит один ответ на устройство (backend/app/api/routes/user.py → /user/survey).
// Показ: карточка в Кабинете (components/SurveyCard.tsx), после трёх разных дней захода, пока не ответил;
// «Позже» прячет её на неделю. Прямая ссылка — /profile/survey.

const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

export const SURVEY_DONE_KEY = "survey_done";
export const SURVEY_LATER_KEY = "survey_later_until";
export const SURVEY_DAYS_KEY = "survey_days";
const MIN_DAYS = 3;
const LATER_MS = 7 * 24 * 3600 * 1000;

export const FREQ: [string, string][] = [
  ["daily", "Каждый день"], ["weekly3", "Несколько раз в неделю"], ["weekly", "Раз в неделю"], ["rare", "Реже"],
];
export const USED: [string, string][] = [
  ["today", "Расписание на сегодня"], ["week", "Расписание на неделю"], ["rooms", "Аудитории"],
  ["teachers", "Педагоги"], ["changes", "Изменения в расписании"], ["compare", "Сравнение с другой группой"],
];
export const RECOMMEND: [string, string][] = [["yes", "Да"], ["think", "Я подумаю"], ["no", "Нет"]];

export interface SurveyForm {
  freq: string | null;
  used: string[];
  missing: string;
  annoy: string;
  rating: number | null;
  recommend: string | null;
  change: string;
}

export const EMPTY_SURVEY: SurveyForm = { freq: null, used: [], missing: "", annoy: "", rating: null, recommend: null, change: "" };

export function surveyFilled(f: SurveyForm): boolean {
  return !!(f.freq || f.used.length || f.missing.trim() || f.annoy.trim() || f.rating || f.recommend || f.change.trim());
}

export async function sendSurvey(deviceId: string, f: SurveyForm): Promise<void> {
  const r = await fetch(`${API_BASE}/user/survey`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, ...f }),
  });
  if (!r.ok) {
    let text = "Не удалось отправить — проверьте интернет";
    try { const j = await r.json(); if (typeof j.detail === "string") text = j.detail; } catch { /* не JSON */ }
    throw new Error(text);
  }
  try { localStorage.setItem(SURVEY_DONE_KEY, "1"); } catch { /* приватный режим */ }
}

/** Отмечает сегодняшний заход (по дню) — после трёх разных дней покажем карточку. Вызывать из эффекта. */
export function noteSurveyDay(): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const days: string[] = JSON.parse(localStorage.getItem(SURVEY_DAYS_KEY) ?? "[]");
    if (!days.includes(today)) localStorage.setItem(SURVEY_DAYS_KEY, JSON.stringify([...days, today].slice(-10)));
  } catch { /* приватный режим */ }
}

/** Показывать ли карточку: не отвечал, не нажал «Позже» недавно и заходил хотя бы в три разных дня.
 *  Ключ survey_test = «1» в браузере показывает её сразу (проверка владельцем). */
export function surveyDue(): boolean {
  try {
    if (localStorage.getItem(SURVEY_DONE_KEY) === "1") return false;
    if (localStorage.getItem("survey_test") === "1") return true;
    if (Date.now() < Number(localStorage.getItem(SURVEY_LATER_KEY) ?? 0)) return false;
    const days: string[] = JSON.parse(localStorage.getItem(SURVEY_DAYS_KEY) ?? "[]");
    return days.length >= MIN_DAYS;
  } catch { return false; }
}

export function surveyLater(): void {
  try { localStorage.setItem(SURVEY_LATER_KEY, String(Date.now() + LATER_MS)); } catch { /* приватный режим */ }
}
