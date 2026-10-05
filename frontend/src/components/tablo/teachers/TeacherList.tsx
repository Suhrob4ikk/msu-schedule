"use client";
/**
 * Список педагогов «Табло»: поиск «Фамилия» (с начала любого слова, ё = е,
 * таджикские буквы), «N педагогов · сегодня понедельник», «А–Я», «Недавние»,
 * секции по буквам и статус под ФИО («Сейчас · ауд. 702 · до 11:15»).
 * На широком экране — панель слева со своей прокруткой и полосой букв.
 * Клавиши: «/» — в поиск, ↑ ↓ — по найденным, Enter — открыть.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Teacher } from "@/lib/api";
import {
  buildSections, listSummary, matchesLabel, searchTeachers, similarTeachers, type ListStatus,
} from "@/lib/tablo/teachers";
import Icon from "../Icon";
import { Popover, Sheet } from "../Overlay";

function Name({ name, range }: { name: string; range?: [number, number] }) {
  if (!range) return <>{name}</>;
  return (
    <>
      {name.slice(0, range[0])}
      <mark className="t-mark">{name.slice(range[0], range[1])}</mark>
      {name.slice(range[1])}
    </>
  );
}

function Row({ t, status, selected, active, range, onPick }: {
  t: Teacher;
  status: ListStatus | null | undefined;
  selected: boolean;
  active?: boolean;
  range?: [number, number];
  onPick: (t: Teacher) => void;
}) {
  const st = status ?? null;
  return (
    <button
      type="button"
      className={`t-trow ${selected ? "t-trow-sel" : ""} ${active ? "t-trow-active" : ""}`}
      onClick={() => onPick(t)}
      aria-current={selected ? "true" : undefined}
      aria-label={[t.name, st?.spoken].filter(Boolean).join(". ")}
    >
      <span className="min-w-0">
        <span className="t-trow-name"><Name name={t.name} range={range} /></span>
        {st && (
          <span className={`t-trow-st ${st.kind === "now" ? "t-st-now" : st.kind === "later" ? "t-st-later" : ""}`}>
            {st.kind === "now" && <i aria-hidden="true" />}{st.text}
          </span>
        )}
      </span>
      <Icon name="chevronRight" size={18} className="t-trow-chev" />
    </button>
  );
}

export default function TeacherList({
  teachers, statuses, selectedId, recentIds, onPick, now, panel, loading, error, onRetry,
}: {
  teachers: Teacher[];
  statuses: Map<number, ListStatus | null>;
  selectedId: number | null;
  recentIds: number[];
  onPick: (t: Teacher) => void;
  now: Date | null;
  /** true — панель слева на широком экране (своя прокрутка, полоса букв). */
  panel: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [lettersOpen, setLettersOpen] = useState(false);
  const [lettersAnchor, setLettersAnchor] = useState<HTMLElement | null>(null);

  const matches = useMemo(() => searchTeachers(teachers, query), [teachers, query]);
  const sections = useMemo(() => buildSections(teachers), [teachers]);
  const similar = useMemo(
    () => (matches && matches.length === 0 ? similarTeachers(teachers, query) : []),
    [matches, teachers, query],
  );
  const recent = useMemo(
    () => recentIds.map(id => teachers.find(t => t.id === id)).filter((t): t is Teacher => !!t),
    [recentIds, teachers],
  );

  // «/» — в поиск (если не печатают в другом поле)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!matches?.length) {
      if (e.key === "Escape" && query) { e.preventDefault(); setQuery(""); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(matches.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); onPick(matches[Math.min(active, matches.length - 1)].teacher); }
    else if (e.key === "Escape") { e.preventDefault(); setQuery(""); }
  };

  const goLetter = (letter: string) => {
    setLettersOpen(false);
    const el = document.getElementById(`tl-${letter}`);
    if (!el) return;
    if (panel && scroller.current) {
      scroller.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
    } else {
      const head = document.querySelector<HTMLElement>(".t-top")?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - head - 8, behavior: "smooth" });
    }
  };

  const letters = sections.map(s => s.letter);
  const letterGrid = (
    <div className="t-letters" role="list">
      {letters.map(l => (
        <button key={l} type="button" className="t-letter" onClick={() => goLetter(l)} aria-label={`Буква ${l}`}>{l}</button>
      ))}
    </div>
  );

  return (
    <div className={panel ? "t-tlist t-tlist-panel" : "t-tlist"}>
      <div className="t-tsearch-wrap">
        <label className={`t-tsearch ${query ? "t-tsearch-on" : ""}`}>
          <Icon name="search" size={22} />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onInputKey}
            placeholder="Фамилия"
            aria-label="Поиск по фамилии"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button type="button" className="t-tsearch-clear" onClick={() => { setQuery(""); input.current?.focus(); }} aria-label="Очистить поиск">
              <Icon name="close" size={20} />
            </button>
          ) : panel ? <kbd className="t-kbd" aria-hidden="true">/</kbd> : null}
        </label>
      </div>

      <div className="t-tlist-body" ref={scroller}>
        {error && !teachers.length ? (
          <div className="t-tempty-state">
            <Icon name="wifiOff" size={36} />
            <b>Нет подключения</b>
            <span>Список педагогов загрузится, когда появится сеть.</span>
            <button type="button" className="t-btn-fill" onClick={onRetry}>Повторить</button>
          </div>
        ) : loading && !teachers.length ? (
          <div className="flex flex-col gap-2 p-3" role="status" aria-label="Загружаем педагогов">
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="t-skel h-14" />)}
          </div>
        ) : matches ? (
          <>
            <div className="t-tlist-sum" aria-live="polite">
              <span>{matches.length ? `Найдено ${matches.length}` : "Ничего не найдено"}</span>
              {panel && matches.length > 0 && <kbd className="t-kbd">↑ ↓ · Enter</kbd>}
              <span className="sr-only">{matches.length ? matchesLabel(matches.length) : ""}</span>
            </div>
            {matches.map((m, i) => (
              <Row key={m.teacher.id} t={m.teacher} status={statuses.get(m.teacher.id)} range={m.range}
                selected={m.teacher.id === selectedId} active={panel && i === active} onPick={onPick} />
            ))}
            {matches.length === 0 && (
              <div className="t-tnone">
                <p>по запросу «{query.trim()}»</p>
                {similar.length > 0 && (
                  <>
                    <p className="t-over mt-4 mb-1">Похожая фамилия</p>
                    {similar.map(t => (
                      <Row key={t.id} t={t} status={statuses.get(t.id)} selected={t.id === selectedId} onPick={onPick} />
                    ))}
                  </>
                )}
                <p className="t-over mt-5 mb-1">Ищете по предмету?</p>
                <p className="text-[15px] text-[var(--text-2)]">Поиск идёт по фамилии. Предмет можно найти в расписании группы.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="t-tlist-sum">
              <span>{now ? listSummary(teachers.length, now) : ""}</span>
              {!panel && (
                <button type="button" className="t-az" onClick={e => { setLettersAnchor(e.currentTarget); setLettersOpen(o => !o); }}
                  aria-expanded={lettersOpen}>А–Я</button>
              )}
            </div>
            {recent.length > 0 && (
              <section aria-label="Недавние">
                <h3 className="t-tsec">Недавние</h3>
                {recent.map(t => (
                  <Row key={`r${t.id}`} t={t} status={statuses.get(t.id)} selected={t.id === selectedId} onPick={onPick} />
                ))}
              </section>
            )}
            {sections.map(s => (
              <section key={s.letter} aria-label={`Буква ${s.letter}`}>
                <h3 id={`tl-${s.letter}`} className="t-tsec t-tsec-letter">{s.letter}</h3>
                {s.teachers.map(t => (
                  <Row key={t.id} t={t} status={statuses.get(t.id)} selected={t.id === selectedId} onPick={onPick} />
                ))}
              </section>
            ))}
          </>
        )}
      </div>

      {/* Полоса букв справа — только на широкой панели */}
      {panel && !matches && letters.length > 0 && (
        <nav className="t-rail" aria-label="Буквы">
          {letters.map(l => <button key={l} type="button" onClick={() => goLetter(l)} aria-label={`Буква ${l}`}>{l}</button>)}
        </nav>
      )}

      {lettersOpen && (panel ? (
        <Popover anchor={lettersAnchor} onClose={() => setLettersOpen(false)} width={340} align="end" label="Перейти к букве">
          <div className="t-panel p-3">
            <p className="text-[18px] font-extrabold px-1 pb-2">Перейти к букве</p>
            {letterGrid}
          </div>
        </Popover>
      ) : (
        <Sheet onClose={() => setLettersOpen(false)} label="Перейти к букве" title="Перейти к букве">
          <div className="p-4">{letterGrid}</div>
        </Sheet>
      ))}
    </div>
  );
}
