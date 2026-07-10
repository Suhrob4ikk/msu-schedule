"use client";
import { useMemo, useState } from "react";
import { Group, shortGroupName } from "@/lib/api";

interface Props {
  groups: Group[];
  value: Group | null;
  onChange: (group: Group) => void;
  /** Компактный режим: когда группа выбрана — одна строка, чипы раскрываются по клику */
  collapsible?: boolean;
}

const DIR_ORDER = ["ПМиИ", "ХФММ", "Геология", "МО", "Лингвистика", "ГМУ"];

export default function GroupSelector({ groups, value, onChange, collapsible }: Props) {
  const [pendingDir, setPendingDir] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  // После выбора группы в компактном режиме — сворачиваемся
  const pick = (g: Group) => {
    onChange(g);
    setPendingDir(null);
    if (collapsible) setExpanded(false);
  };

  // Выбор в два шага: направление → курс (без автовыбора курса, иначе
  // «ПМиИ 3 → ХФММ 2» требовал бы лишний круг через «изменить»).
  const onDir = (dir: string) => {
    if (dir === valueDir) {
      setPendingDir(null); // своё направление: показываем его курсы, текущий подсвечен
      return;
    }
    setPendingDir(dir);
    const ys = [...new Set(groups.filter(g => shortGroupName(g.name) === dir).map(g => g.year))];
    // Курс всего один — выбирать нечего, берём сразу
    if (ys.length === 1) {
      const g = groups.find(g => shortGroupName(g.name) === dir && g.year === ys[0]);
      if (g) pick(g);
    }
  };

  const onYear = (year: number) => {
    const dir = activeDir;
    if (!dir) return;
    const g = groups.find(g => shortGroupName(g.name) === dir && g.year === year);
    if (g) pick(g);
  };

  // ── Компактная строка (группа выбрана, чипы спрятаны) ──
  if (collapsible && value && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] transition-colors text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Группа</span>
          <span className="block font-bold text-base lg:text-lg truncate" style={{ color: "var(--foreground)" }}>
            {valueDir} · {value.year} курс
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0 text-sm text-[var(--muted)]">
          изменить
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Направление</p>
          {collapsible && value && (
            <button
              onClick={() => { setPendingDir(null); setExpanded(false); }}
              className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--primary)] transition-colors"
            >
              Свернуть
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
          )}
        </div>
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
