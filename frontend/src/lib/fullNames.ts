/**
 * Полные имена преподавателей и опрос студентов (сервер — backend/app/services/full_names.py).
 *
 * Решения владельца (8 окт 2026):
 * - в расписании «Джумаев Э.Х.» остаётся, полное имя раскрывается кнопкой — каждый раз
 *   заново, ничего не запоминается;
 * - пока имя не утверждено, спрашиваем тех, у чьей группы этот преподаватель ведёт пары;
 * - своё имя — на буквы инициалов («Э.Х.» → «Э…», «Х…»), окончания не проверяем;
 * - опрос не должен мешать: строка с крестиком, напоминание в «Расписании» не чаще раза
 *   в неделю, крестик прячет на неделю.
 *
 * Здесь же — что человек уже ответил и что спрятал (localStorage), чтобы не спрашивать
 * повторно и не ходить ради этого на сервер.
 */
import { useEffect, useState } from "react";
import { api, onApiUpdate, type FullNamesData } from "./api";

const ANSWERED_KEY = "fn_answered";       // { teacher: "voted" | "pending" }
const HIDDEN_KEY = "fn_hidden";           // { teacher: ISO-дата, до которой не показывать }
const REMINDER_KEY = "fn_reminder_week";  // понедельник недели, когда напоминание закрыли
const HIDE_DAYS = 7;

// ── данные с сервера ──────────────────────────────────────────────────────
let _cache: FullNamesData | null = null;

export function useFullNames(): FullNamesData | null {
  const [data, setData] = useState<FullNamesData | null>(_cache);
  useEffect(() => {
    let alive = true;
    const load = () => api.getFullNames()
      .then(d => { _cache = d; if (alive) setData(d); })
      .catch(() => { /* нет сети — без полных имён, как раньше */ });
    load();
    const off = onApiUpdate(p => { if (p === "/schedule/full-names") load(); });
    return () => { alive = false; off(); };
  }, []);
  return data;
}

/** После ответа или решения владельца — перечитать список. */
export function refreshFullNames(): Promise<void> {
  return api.getFullNames().then(d => { _cache = d; }).catch(() => {});
}

// ── имена ─────────────────────────────────────────────────────────────────
const SHORT_RE = /^(.*?)\s+((?:[А-ЯЁ][а-яё]?\.\s*)+)$/;

/** «Одинабеков Дж.М.» → инициалы ["Дж", "М"] */
export function initialsOf(short: string): string[] {
  const m = short.trim().match(SHORT_RE);
  return m ? m[2].match(/[А-ЯЁ][а-яё]?/g) ?? [] : [];
}

/** Настоящие ФИО по отдельности: «Балхова С.Я., Собко В.И.» → два человека. Коды кафедр — мимо. */
export function personsOf(name: string | null | undefined): string[] {
  return (name ?? "").split(",").map(p => p.trim()).filter(p => /[А-ЯЁ][а-яё]?\./.test(p));
}

/** Как выглядит имя целиком: составное — по частям, где полного имени нет — как было. */
export function expandName(name: string, data: FullNamesData | null): string {
  if (!data) return name;
  return name.split(",").map(p => p.trim()).map(p => data.names[p] ?? p).join(", ");
}

export function hasFullName(name: string, data: FullNamesData | null): boolean {
  return !!data && personsOf(name).some(p => data.names[p]);
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

export function tidyName(text: string): string {
  return text.trim().replace(/\s+/g, " ").split(" ").filter(Boolean)
    .map(w => w.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("-"))
    .join(" ");
}

/** Та же проверка, что на сервере: null — подходит, иначе текст подсказки. */
export function proposalError(short: string, text: string): string | null {
  const value = tidyName(text);
  if (!value) return "";
  if (value.length > 60) return "Слишком длинно";
  if (/[^А-Яа-яЁё\- ]/.test(value)) return "Только русские буквы";
  const ini = initialsOf(short);
  const words = value.split(" ");
  if (!ini.length) return null;
  if (words.length < ini.length) return ini.length > 1 ? "Впишите имя и отчество" : "Впишите имя";
  for (let i = 0; i < ini.length; i++) {
    if (!norm(words[i]).startsWith(norm(ini[i]))) {
      return `${i === 0 ? "Имя" : "Отчество"} должно начинаться на «${ini[i]}» — как в «${ini.join(".")}.»`;
    }
  }
  return null;
}

// ── кто я и что уже ответил ───────────────────────────────────────────────
export function myDeviceId(): string | null {
  try { return localStorage.getItem("msu_device_id_v2"); } catch { return null; }
}

export function myGroupId(): number | null {
  try { return Number(localStorage.getItem("selected_group_id")) || null; } catch { return null; }
}

function readMap(key: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key) || "{}") ?? {}; } catch { return {}; }
}
function writeMap(key: string, m: Record<string, string>): void {
  try { localStorage.setItem(key, JSON.stringify(m)); } catch { /* приватный режим */ }
}

export type Answer = "voted" | "pending";

export function answerOf(teacher: string): Answer | null {
  const a = readMap(ANSWERED_KEY)[teacher];
  // «dunno» — ответ «Не знаю» до 9 окт 2026; его больше нет, а на сервере он стёрт
  return a === "voted" || a === "pending" ? a : null;
}
export function rememberAnswer(teacher: string, a: Answer | null): void {
  const m = readMap(ANSWERED_KEY);
  if (a) m[teacher] = a; else delete m[teacher];
  writeMap(ANSWERED_KEY, m);
}

export function isHidden(teacher: string, now = new Date()): boolean {
  const until = readMap(HIDDEN_KEY)[teacher];
  return !!until && new Date(until) > now;
}
export function hideFor(teacher: string): void {
  const m = readMap(HIDDEN_KEY);
  m[teacher] = new Date(Date.now() + HIDE_DAYS * 86_400_000).toISOString();
  writeMap(HIDDEN_KEY, m);
}

/** Кого спросить: без утверждённого имени, есть варианты или можно предложить своё, ещё не отвечал и не прятал. */
export function shouldAsk(teacher: string, data: FullNamesData | null): boolean {
  return !!data && !data.names[teacher] && !answerOf(teacher) && !isHidden(teacher);
}

function mondayIso(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function reminderClosedThisWeek(): boolean {
  try { return localStorage.getItem(REMINDER_KEY) === mondayIso(); } catch { return true; }
}
export function closeReminderThisWeek(): void {
  try { localStorage.setItem(REMINDER_KEY, mondayIso()); } catch { /* приватный режим */ }
}
