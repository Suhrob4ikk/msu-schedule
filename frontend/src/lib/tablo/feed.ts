/**
 * Лента «Изменений» для сайта (макеты izmeneniya-*): виды записей для фильтра,
 * склейка «Перенос» и строки «было → стало». Без React.
 *
 * Сервер знает только added / removed / changed / new_week. «Перенос» на
 * бэкенде не записывается, поэтому собирается здесь: в одной синхронизации у
 * группы пара с тем же предметом пропала в одном месте и появилась в другом.
 * Если угадать не вышло, пара честно остаётся парой записей «Удалено» и
 * «Добавлено».
 */
import { buildDiff, changeDate, changedFields, changeKind, type ChangeRec } from './changes';
import { parseIso } from './schedule';

export type FeedKind = 'week' | 'room' | 'teacher' | 'subject' | 'other' | 'move' | 'removed' | 'added';

export const FEED_LABEL: Record<FeedKind, string> = {
  week: 'Новая неделя', room: 'Аудитория', teacher: 'Преподаватель', subject: 'Замена предмета',
  other: 'Изменено', move: 'Перенос', removed: 'Удалено', added: 'Добавлено',
};

/** Класс цвета бейджа (tablo.css, t-tone-*). */
export const FEED_TONE: Record<FeedKind, string> = {
  week: 'week', room: 'exam', teacher: 'lab', subject: 'flow', other: 'neutral',
  move: 'lec', removed: 'removed', added: 'added',
};

/** Всегда показываются в фильтре, даже с нулём (как «Добавлено 0» на макете). */
export const CORE_KINDS: FeedKind[] = ['week', 'room', 'move', 'removed', 'added'];
export const KIND_ORDER: FeedKind[] = ['week', 'room', 'teacher', 'subject', 'other', 'move', 'removed', 'added'];

export interface FeedRow {
  id: string;
  kind: FeedKind;
  /** Когда обнаружено, мс. */
  at: number;
  c: ChangeRec;
  /** Для переноса — запись «появилась на новом месте» (c — «пропала со старого»). */
  to?: ChangeRec;
}

const at = (c: ChangeRec) => Date.parse(c.detected_at);
const subj = (d: ChangeRec['old_details']) => (d?.subject ?? '').trim().toLowerCase();

function changedKind(c: ChangeRec): FeedKind {
  const o = c.old_details;
  const n = c.new_details;
  if (!o || !n) return 'other';
  const f = changedFields(o, n);
  if (f.includes('subject')) return 'subject';
  if (f.includes('room')) return 'room';
  if (f.includes('teacher')) return 'teacher';
  if (f.includes('lesson_type')) return 'subject';
  return 'other';
}

const MOVE_WINDOW_MS = 15 * 60_000;

/** Записи сервера → строки ленты, новые сверху. */
export function buildFeed(list: ChangeRec[]): FeedRow[] {
  const valid = list.filter(c => !!changeKind(c.change_type) && !Number.isNaN(at(c)));
  const removed = valid.filter(c => changeKind(c.change_type) === 'removed' && c.group_id != null && subj(c.old_details));
  const added = valid.filter(c => changeKind(c.change_type) === 'added' && c.group_id != null && subj(c.new_details));
  const used = new Set<number>();
  const rows: FeedRow[] = [];

  for (const r of removed) {
    let best: ChangeRec | null = null;
    let bestGap = Infinity;
    for (const a of added) {
      if (used.has(a.id) || a.group_id !== r.group_id || subj(a.new_details) !== subj(r.old_details)) continue;
      const gap = Math.abs(at(a) - at(r));
      const sameSlot = a.week_start === r.week_start && a.day_of_week === r.day_of_week && a.pair_number === r.pair_number;
      if (gap <= MOVE_WINDOW_MS && !sameSlot && gap < bestGap) { best = a; bestGap = gap; }
    }
    if (best) {
      used.add(best.id);
      used.add(r.id);
      rows.push({ id: `m:${r.id}:${best.id}`, kind: 'move', at: Math.max(at(r), at(best)), c: r, to: best });
    }
  }

  for (const c of valid) {
    if (used.has(c.id)) continue;
    const k = changeKind(c.change_type)!;
    const kind: FeedKind = k === 'new_week' ? 'week' : k === 'changed' ? changedKind(c) : k;
    rows.push({ id: `c:${c.id}`, kind, at: at(c), c });
  }
  return rows.sort((a, b) => b.at - a.at);
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «3 окт, 12:59» — когда сервер заметил правку. */
export function stamp(ms: number): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hm}`;
}

/** «сб, 3 октября» — день самой пары; null, если у записи нет даты. */
export function slotDay(c: ChangeRec): string | null {
  const iso = changeDate(c);
  if (!iso) return null;
  const d = parseIso(iso);
  return `${DAY_SHORT[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** «Ср, 30.09 · IV пара» — короткое место пары для переноса. */
export function slotShort(c: ChangeRec): string {
  const iso = changeDate(c);
  const d = iso ? parseIso(iso) : null;
  const day = d
    ? `${DAY_SHORT[(d.getDay() + 6) % 7][0].toUpperCase()}${DAY_SHORT[(d.getDay() + 6) % 7].slice(1)}, ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
    : c.day_of_week ? c.day_of_week : '';
  return [day, c.pair_number ? `${c.pair_number} пара` : ''].filter(Boolean).join(' · ');
}

/** Название предмета записи (по новому, если есть, иначе по старому). */
export function subjectOf(c: ChangeRec): string | null {
  return (c.new_details?.subject || c.old_details?.subject || '').trim() || (c.change_type === 'changed' ? c.new_value : null) || null;
}

/** Строка «было → стало» для обычных записей (не перенос, не новая неделя). */
export function feedDiff(row: FeedRow): { label: string | null; before: string | null; after: string | null; note: string | null } {
  const d = buildDiff(row.c);
  const strip = (s: string | null) => (s ? s.replace(/^ауд\. /, '') : s);
  if (row.kind === 'removed') return { label: null, before: null, after: null, note: 'Пара убрана из расписания' };
  if (row.kind === 'added') return { label: 'Добавлено', before: null, after: d.after, note: null };
  if (row.kind === 'room') return { label: 'Аудитория', before: strip(d.before), after: strip(d.after), note: row.c.new_details?.teacher ?? null };
  if (row.kind === 'teacher') return { label: 'Преподаватель', before: d.before, after: d.after, note: null };
  return { label: null, before: d.before, after: d.after, note: null };
}
