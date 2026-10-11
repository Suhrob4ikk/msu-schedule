"use client";
/**
 * Верх «Расписания» у владельца (привязанные в /dev устройства; 11 окт 2026): приветствие
 * и две плашки — серия (учебные дни подряд) и сколько семестра позади. Админского здесь
 * нет (владелец: «это всё я и так в панели могу»); пульт, быстрые действия, поиск и орбита
 * групп убраны.
 */
import { useOwnerProgress } from "./OwnerTracker";
import { termOf } from "@/lib/ownerProgress";

const days = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "дня" : "дней");

export default function OwnerHome({ name, now }: { name: string; now: Date }) {
  const pg = useOwnerProgress();
  const term = termOf(now);
  const h = now.getHours();
  const hello = h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <div className="ow-home">
      <div className="ow-hello">{hello},<br /><span>{name}</span></div>
      <div className="ow-chips">
        <div className="ow-glass ow-chip">
          <span className="ow-chip-ic ow-chip-f" aria-hidden="true">F</span>
          <div><b>{pg ? `${pg.streak} ${days(pg.streak)}` : "—"}</b><small>серия подряд</small></div>
        </div>
        <div className="ow-glass ow-chip">
          <span className="ow-chip-ic" aria-hidden="true">%</span>
          {term
            ? <div><b>{Math.round(term.share * 100)}%</b><small>семестра позади</small></div>
            : <div><b>Сессия</b><small>или каникулы</small></div>}
        </div>
      </div>
    </div>
  );
}
