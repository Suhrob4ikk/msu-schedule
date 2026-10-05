/**
 * «Сравнение групп» (макеты sravnenie-*): таблица «дни × пары», в ячейке по
 * строке на каждую группу, и окна, когда свободны все. Без React.
 */
import { DAYS_ORDER, PAIR_NUMBERS, type Lesson } from '../api';

export interface CmpLesson { subject: string; room: string | null }

/** Занятия одной группы по ключу «деньИндекс|пара». Если в слоте несколько (подгруппы) — первое. */
export type SlotMap = Map<string, CmpLesson>;

export const slotKey = (dayIndex: number, pair: string) => `${dayIndex}|${pair}`;

export function slotMap(lessons: Lesson[]): SlotMap {
  const m: SlotMap = new Map();
  for (const l of lessons) {
    const d = DAYS_ORDER.indexOf(l.day_of_week.toLowerCase());
    if (d < 0 || d > 5) continue;
    const k = slotKey(d, l.pair_number);
    if (!m.has(k)) m.set(k, { subject: l.subject, room: l.room?.name ?? null });
  }
  return m;
}

/** Дни, где есть пара хотя бы у одной группы: у выходного «свободны все» ничего не значит. */
export function activeDays(maps: SlotMap[]): number[] {
  const out: number[] = [];
  for (let d = 0; d < 6; d++) {
    if (maps.some(m => PAIR_NUMBERS.some(p => m.has(slotKey(d, p))))) out.push(d);
  }
  return out;
}

export interface Window { key: string; dayIndex: number; pairs: string[] }

/** Подряд идущие пары, когда свободны все группы, по дням. */
export function freeWindows(maps: SlotMap[]): Window[] {
  const out: Window[] = [];
  for (const d of activeDays(maps)) {
    let run: string[] = [];
    const flush = () => {
      if (run.length) out.push({ key: `${d}|${run[0]}`, dayIndex: d, pairs: run });
      run = [];
    };
    for (const p of PAIR_NUMBERS) {
      if (maps.every(m => !m.has(slotKey(d, p)))) run.push(p);
      else flush();
    }
    flush();
  }
  return out;
}

/** «I–III» или «II». */
export const windowLabel = (w: Window) => (w.pairs.length > 1 ? `${w.pairs[0]}–${w.pairs[w.pairs.length - 1]}` : w.pairs[0]);

export const everyone = (n: number) => (n === 2 ? 'Обе группы свободны' : 'Все группы свободны');
