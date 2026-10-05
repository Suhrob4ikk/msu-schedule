"use client";
/** Выбор группы для «Сравнения»: направление и курс чипами, выбор применяется сразу. */
import { useMemo } from "react";
import { shortGroupName, type Group } from "@/lib/api";
import Icon from "../Icon";

const DIRECTION_ORDER = ["ПМиИ", "ХФММ", "Геология", "МО", "Лингвистика", "ГМУ"];

export default function GroupPicker({ groups, value, onPick, onRemove }: {
  groups: Group[];
  value: Group | null;
  onPick: (g: Group) => void;
  /** «Убрать группу» — только у лишних, не у первой. */
  onRemove?: () => void;
}) {
  const directions = useMemo(() => {
    const names = [...new Set(groups.map(g => shortGroupName(g.name)))];
    return names.sort((a, b) => {
      const ia = DIRECTION_ORDER.indexOf(a);
      const ib = DIRECTION_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "ru");
    });
  }, [groups]);
  const dir = value ? shortGroupName(value.name) : null;
  const courses = useMemo(
    () => [...new Set(groups.filter(g => shortGroupName(g.name) === dir).map(g => g.year))].sort((a, b) => a - b),
    [groups, dir],
  );

  const pickDirection = (d: string) => {
    const options = groups.filter(g => shortGroupName(g.name) === d).sort((a, b) => a.year - b.year);
    const same = options.find(g => g.year === value?.year);
    const g = same ?? options[0];
    if (g) onPick(g);
  };

  return (
    <div className="t-gpanel">
      <p className="t-over">Направление</p>
      <div className="t-chips" role="radiogroup" aria-label="Направление">
        {directions.map(d => (
          <button key={d} type="button" role="radio" aria-checked={d === dir}
            className={`t-chip ${d === dir ? "t-chip-sel" : ""}`} onClick={() => pickDirection(d)}>{d}</button>
        ))}
      </div>
      {dir && (
        <>
          <p className="t-over">Курс</p>
          <div className="t-chips" role="radiogroup" aria-label="Курс">
            {courses.map(y => (
              <button key={y} type="button" role="radio" aria-checked={y === value?.year}
                className={`t-chip ${y === value?.year ? "t-chip-sel" : ""}`}
                onClick={() => { const g = groups.find(x => shortGroupName(x.name) === dir && x.year === y); if (g) onPick(g); }}>
                {y} курс
              </button>
            ))}
          </div>
        </>
      )}
      {onRemove && (
        <button type="button" className="t-btn-ghost t-cmp-remove" onClick={onRemove}>
          <Icon name="close" size={18} />
          Убрать группу
        </button>
      )}
    </div>
  );
}
