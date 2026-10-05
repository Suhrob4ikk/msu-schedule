"use client";
/**
 * Выбор недели и группы (макет 4; на телефоне — шторка, как в приложении):
 * «Неделя» (радио; невышедшая — неактивна), на телефоне ещё «Вид», затем
 * «Направление» и «Курс» чипами. Выбор применяется сразу. При чужой группе —
 * «Вернуться к моей группе».
 */
import { useMemo } from "react";
import { shortGroupName, type Group } from "@/lib/api";
import Icon from "../Icon";

export interface WeekOption {
  weekStart: string;
  title: string;
  sub: string;
  disabled: boolean;
}

const DIRECTION_ORDER = ["ПМиИ", "ХФММ", "Геология", "МО", "Лингвистика", "ГМУ"];

export default function GroupPanel({
  groups, group, myGroup, weeks, weekStart, onPickWeek, onPickGroup, viewMode, onViewMode, footer,
}: {
  groups: Group[];
  group: Group | null;
  myGroup: Group | null;
  weeks: WeekOption[];
  weekStart: string | null;
  onPickWeek: (ws: string) => void;
  onPickGroup: (g: Group) => void;
  /** Только на телефоне и планшете: «Лентой» / «По дням». */
  viewMode?: "list" | "pages";
  onViewMode?: (m: "list" | "pages") => void;
  footer?: React.ReactNode;
}) {
  const directions = useMemo(() => {
    const names = [...new Set(groups.map(g => shortGroupName(g.name)))];
    return names.sort((a, b) => {
      const ia = DIRECTION_ORDER.indexOf(a);
      const ib = DIRECTION_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "ru");
    });
  }, [groups]);
  const dir = group ? shortGroupName(group.name) : null;
  const courses = useMemo(
    () => [...new Set(groups.filter(g => shortGroupName(g.name) === dir).map(g => g.year))].sort((a, b) => a - b),
    [groups, dir],
  );

  const pickDirection = (d: string) => {
    const options = groups.filter(g => shortGroupName(g.name) === d).sort((a, b) => a.year - b.year);
    if (!options.length) return;
    const same = options.find(g => g.year === group?.year);
    onPickGroup(same ?? options[0]);
  };
  const pickCourse = (y: number) => {
    const g = groups.find(x => shortGroupName(x.name) === dir && x.year === y);
    if (g) onPickGroup(g);
  };

  const foreign = !!group && !!myGroup && group.id !== myGroup.id;

  return (
    <div className="t-gpanel">
      {foreign && myGroup && (
        <button type="button" className="t-back-mine" onClick={() => onPickGroup(myGroup)}>
          <Icon name="undo" size={20} />
          Вернуться к моей группе · {shortGroupName(myGroup.name)} · {myGroup.year} курс
        </button>
      )}

      <p className="t-over">Неделя</p>
      <div role="radiogroup" aria-label="Неделя" className="t-radios">
        {weeks.map(w => {
          const on = w.weekStart === weekStart;
          return (
            <button key={w.weekStart} type="button" role="radio" aria-checked={on} disabled={w.disabled}
              className="t-radio" onClick={() => onPickWeek(w.weekStart)}>
              <span>
                <b>{w.title}</b>
                <span>{w.sub}</span>
              </span>
              <i className={`t-radio-dot ${on ? "t-radio-on" : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {viewMode && onViewMode && (
        <>
          <p className="t-over">Вид</p>
          <div role="radiogroup" aria-label="Вид" className="t-radios">
            {([["list", "Лентой", "Вся неделя, листать вверх и вниз"], ["pages", "По дням", "Один день, листать влево и вправо"]] as const).map(([m, title, sub]) => (
              <button key={m} type="button" role="radio" aria-checked={viewMode === m} className="t-radio" onClick={() => onViewMode(m)}>
                <span><b>{title}</b><span>{sub}</span></span>
                <i className={`t-radio-dot ${viewMode === m ? "t-radio-on" : ""}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </>
      )}

      <p className="t-over">Направление</p>
      <div className="t-chips" role="radiogroup" aria-label="Направление">
        {directions.map(d => (
          <button key={d} type="button" role="radio" aria-checked={d === dir}
            className={`t-chip ${d === dir ? "t-chip-sel" : ""} ${myGroup && shortGroupName(myGroup.name) === d && d !== dir ? "t-chip-mine" : ""}`}
            onClick={() => pickDirection(d)}>
            {d}
          </button>
        ))}
      </div>

      <p className="t-over">Курс</p>
      <div className="t-chips" role="radiogroup" aria-label="Курс">
        {courses.map(y => (
          <button key={y} type="button" role="radio" aria-checked={y === group?.year}
            className={`t-chip ${y === group?.year ? "t-chip-sel" : ""}`} onClick={() => pickCourse(y)}>
            {y} курс
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}
