"use client";
import { useMemo, useState } from "react";
import { Group, shortGroupName } from "@/lib/api";

interface Props {
  groups: Group[];
  value: Group | null;
  onChange: (group: Group) => void;
}

const DIR_ORDER = ["ПМиИ", "ХФММ", "Геология", "МО", "Лингвистика", "ГМУ"];

export default function GroupSelector({ groups, value, onChange }: Props) {
  const [pendingDir, setPendingDir] = useState<string | null>(null);

  const directions = useMemo(() => {
    const dirs = new Set<string>();
    groups.forEach(g => dirs.add(shortGroupName(g.name)));
    return DIR_ORDER.filter(d => dirs.has(d));
  }, [groups]);

  const valueDir = value ? shortGroupName(value.name) : null;
  const activeDir = pendingDir ?? valueDir;

  const years = useMemo(() => {
    if (!activeDir) return [];
    return [...new Set(
      groups.filter(g => shortGroupName(g.name) === activeDir).map(g => g.year)
    )].sort((a, b) => a - b);
  }, [groups, activeDir]);

  const activeYear = (pendingDir == null || pendingDir === valueDir) ? value?.year : undefined;

  const onDir = (dir: string) => {
    if (dir === valueDir) {
      setPendingDir(null);
    } else {
      setPendingDir(dir);
      const ys = [...new Set(groups.filter(g => shortGroupName(g.name) === dir).map(g => g.year))];
      if (ys.length === 1) {
        const g = groups.find(g => shortGroupName(g.name) === dir && g.year === ys[0]);
        if (g) { onChange(g); setPendingDir(null); }
      }
    }
  };

  const onYear = (year: number) => {
    const dir = activeDir;
    if (!dir) return;
    const g = groups.find(g => shortGroupName(g.name) === dir && g.year === year);
    if (g) { onChange(g); setPendingDir(null); }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">Направление</p>
        <div className="flex flex-wrap gap-2">
          {directions.map(dir => (
            <button
              key={dir}
              onClick={() => onDir(dir)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all duration-150 ${
                activeDir === dir
                  ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm"
                  : "bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
              }`}
            >
              {dir}
            </button>
          ))}
        </div>
      </div>

      {activeDir && years.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">Курс</p>
          <div className="flex flex-wrap gap-2">
            {years.map(year => (
              <button
                key={year}
                onClick={() => onYear(year)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all duration-150 ${
                  activeYear === year
                    ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm"
                    : "bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                }`}
              >
                {year} курс
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
