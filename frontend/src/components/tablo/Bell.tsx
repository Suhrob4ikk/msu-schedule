"use client";
/**
 * Колокольчик: панель «Изменения · N новых» — три последних события своей
 * группы (и «новая неделя» факультета) и ссылка «Все изменения». Счётчик —
 * записи новее отметки changes_last_seen; открытие панели его гасит. Та же
 * отметка ставится на странице /changes.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, onApiUpdate, DAYS_ORDER, type Change } from "@/lib/api";
import { buildDiff, changeKind, newLabel, studyWeekRange, type ChangeRec } from "@/lib/tablo/changes";
import { addDays, dushanbeNow } from "@/lib/tablo/schedule";
import { useMediaQuery } from "@/lib/tablo/hooks";
import Icon from "./Icon";
import { Popover, Sheet } from "./Overlay";

const LAST_SEEN_KEY = "changes_last_seen";
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function seenAt(): number {
  try { return Date.parse(localStorage.getItem(LAST_SEEN_KEY) ?? "") || 0; } catch { return 0; }
}

/** «3 окт, 12:59» по Душанбе */
function stamp(iso: string): string {
  const d = dushanbeNow(Date.parse(iso));
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Бейдж: у правки — что именно поменялось («Аудитория»), если поле одно. */
function badgeOf(c: ChangeRec): { label: string; tone: string } | null {
  const kind = changeKind(c.change_type);
  if (!kind) return null;
  if (kind === "new_week") return { label: "Новая неделя", tone: "week" };
  if (kind === "added") return { label: "Добавлено", tone: "added" };
  if (kind === "removed") return { label: "Удалено", tone: "removed" };
  const o = c.old_details;
  const n = c.new_details;
  if (o && n) {
    const diff: string[] = [];
    if ((o.subject ?? "") !== (n.subject ?? "")) diff.push("Предмет");
    if ((o.room ?? "").toLowerCase() !== (n.room ?? "").toLowerCase()) diff.push("Аудитория");
    if ((o.teacher ?? "") !== (n.teacher ?? "")) diff.push("Преподаватель");
    if ((o.lesson_type ?? "").toLowerCase() !== (n.lesson_type ?? "").toLowerCase()) diff.push("Тип занятия");
    if (diff.length === 1) return { label: diff[0], tone: "changed" };
  }
  return { label: "Изменено", tone: "changed" };
}

/** «Сб, 3.10 · II пара» */
function slotLine(c: Change): string {
  const i = c.day_of_week ? DAYS_ORDER.indexOf(c.day_of_week.toLowerCase()) : -1;
  const parts: string[] = [];
  if (i >= 0) {
    const date = c.week_start ? addDays(c.week_start, i) : null;
    parts.push(date ? `${DAY_SHORT[i]}, ${Number(date.slice(8))}.${date.slice(5, 7)}` : DAY_SHORT[i]);
  }
  if (c.pair_number) parts.push(`${c.pair_number} пара`);
  return parts.join(" · ");
}

function ChangeLine({ c }: { c: ChangeRec }) {
  const b = badgeOf(c);
  if (!b) return null;
  const kind = changeKind(c.change_type);
  const diff = buildDiff(c);
  return (
    <div className="t-bell-item">
      <div className="flex items-center justify-between gap-2">
        <span className={`t-badge t-tone-${b.tone}`}>{b.label}</span>
        <span className="text-[13px] text-[var(--text-2)] tabular-nums whitespace-nowrap">{stamp(c.detected_at)}</span>
      </div>
      <p className="mt-1.5 text-[15px] leading-snug">
        {kind === "new_week" ? (
          <>Вышло расписание на {c.week_start ? studyWeekRange(c.week_start) : "новую неделю"}</>
        ) : (
          <>
            {slotLine(c)}
            {diff.before && <> · <s className={kind === "removed" ? "text-[var(--danger)]" : "text-[var(--text-2)]"}>{diff.before}</s></>}
            {diff.before && diff.after && " → "}
            {diff.after && <>{!diff.before && " · "}<b className="font-bold">{diff.after}</b></>}
          </>
        )}
      </p>
    </div>
  );
}

function BellPanel({ items, fresh }: { items: ChangeRec[]; fresh: number }) {
  return (
    <div className="t-panel p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-[19px] font-extrabold">Изменения</h2>
        {fresh > 0 && <span className="t-badge t-tone-week">{newLabel(fresh)}</span>}
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-[15px] text-[var(--text-2)]">Изменений пока нет</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.slice(0, 3).map(c => <ChangeLine key={c.id} c={c} />)}
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-[var(--line)]">
        <Link href="/changes" className="t-link-row">Все изменения</Link>
      </div>
    </div>
  );
}

export default function Bell() {
  const pathname = usePathname();
  const wide = useMediaQuery("(min-width: 640px)");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChangeRec[]>([]);
  const [fresh, setFresh] = useState(0);
  const [freshInPanel, setFreshInPanel] = useState(0);

  const load = useCallback(() => {
    let groupId: number | undefined;
    try { groupId = Number(localStorage.getItem("selected_group_id")) || undefined; } catch { /* приватный режим */ }
    if (!groupId) return;
    api.getChanges(groupId)
      .then(list => {
        const recs = list.filter(c => changeKind(c.change_type)) as ChangeRec[];
        setItems(recs);
        const seen = seenAt();
        setFresh(recs.filter(c => Date.parse(c.detected_at) > seen).length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load, pathname]);
  useEffect(() => onApiUpdate(path => { if (path.startsWith("/schedule/changes")) load(); }), [load]);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchor(e.currentTarget);
    if (open) { setOpen(false); return; }
    setFreshInPanel(fresh);
    setOpen(true);
    if (items[0]) {
      try { localStorage.setItem(LAST_SEEN_KEY, items[0].detected_at); } catch { /* приватный режим */ }
    }
    setFresh(0);
  };
  const close = useCallback(() => setOpen(false), []);

  const label = fresh > 0 ? `Изменения, ${fresh} новых` : "Изменения";
  return (
    <>
      <button type="button" onClick={toggle} aria-label={label} aria-expanded={open}
        className={`t-icon-btn relative ${open ? "t-icon-btn-on" : ""}`}>
        <Icon name="bell" size={24} />
        {fresh > 0 && <span className="t-count">{fresh > 9 ? "9+" : fresh}</span>}
      </button>
      {open && wide && (
        <Popover anchor={anchor} onClose={close} width={400} align="end" label="Изменения">
          <BellPanel items={items} fresh={freshInPanel} />
        </Popover>
      )}
      {open && wide === false && (
        <Sheet onClose={close} label="Изменения">
          <div className="px-0">
            <BellPanel items={items} fresh={freshInPanel} />
          </div>
        </Sheet>
      )}
    </>
  );
}
