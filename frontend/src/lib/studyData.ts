/**
 * Пропуски пар и заметки. Хранятся ТОЛЬКО на устройстве (localStorage),
 * на сервер не уходят.
 *
 * Модель пропусков: отмечаем только то, что пропустил. Отсутствие отметки
 * у уже прошедшей пары = «был». Так студенту не нужно отмечать каждую пару,
 * а статистика получается честной (а не «процент от отмеченных»).
 *
 * Формат ключей задан здесь и продублирован в мобильном (src/studyData.ts) —
 * менять надо в обоих местах.
 */

const SKIP_PREFIX = "miss_";
const NOTE_WEEKLY_PREFIX = "note2_";
const NOTE_DATED_PREFIX = "noted_";

/** Пропуск привязан к конкретной дате — отметки разных недель не смешиваются. */
export const skipKey = (groupId: number | string, date: string, pair: string) =>
  `${SKIP_PREFIX}${groupId}_${date}_${pair}`;

/** Заметка «каждую неделю» — привязана к слоту день+пара, без даты. */
export const noteWeeklyKey = (groupId: number | string, day: string, pair: string) =>
  `${NOTE_WEEKLY_PREFIX}${groupId}_${day}_${pair}`;

/** Разовая заметка — только на конкретную дату. */
export const noteDatedKey = (groupId: number | string, date: string, pair: string) =>
  `${NOTE_DATED_PREFIX}${groupId}_${date}_${pair}`;

/** Сегодняшняя дата как YYYY-MM-DD по МЕСТНОМУ времени.
 *  (toISOString() дал бы UTC — вечером в Душанбе это уже завтра.) */
export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Пару можно отметить как пропущенную, только если она уже прошла. */
export const isPastLesson = (lessonDate: string | null): boolean =>
  !!lessonDate && lessonDate <= todayIso();

export interface SkipStats {
  total: number;
  /** [предмет, сколько пропусков] — по убыванию */
  bySubject: Array<[string, number]>;
}

export function collectSkips(): SkipStats {
  if (typeof window === "undefined") return { total: 0, bySubject: [] };
  const bySubj = new Map<string, number>();
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(SKIP_PREFIX)) continue;
    const subject = (localStorage.getItem(k) ?? "").trim();
    total++;
    if (subject) bySubj.set(subject, (bySubj.get(subject) ?? 0) + 1);
  }
  return {
    total,
    bySubject: [...bySubj.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export interface NoteEntry {
  /** «понедельник, I пара» или «15.09, I пара» */
  slot: string;
  text: string;
}

export function collectNotes(): NoteEntry[] {
  if (typeof window === "undefined") return [];
  const out: NoteEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const weekly = k.startsWith(NOTE_WEEKLY_PREFIX);
    const dated = k.startsWith(NOTE_DATED_PREFIX);
    if (!weekly && !dated) continue;
    const text = (localStorage.getItem(k) ?? "").trim();
    if (!text) continue;
    // ключ: префикс + id группы _ (день|дата) _ пара
    const parts = k.split("_");
    const when = parts[2] ?? "";
    const pair = parts[3] ?? "";
    const label = dated ? formatDateShort(when) : when;
    out.push({ slot: `${label}, ${pair} пара`, text });
  }
  return out;
}

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${d}.${m}` : iso;
}
