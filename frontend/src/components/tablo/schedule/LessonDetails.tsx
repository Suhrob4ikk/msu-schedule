"use client";
/**
 * Подробности пары (макеты 2 и 3): тип и предмет, «Среда, 7 октября · III пара
 * / 11:30–13:00», «Преподаватель ›», «Аудитория ›». У идущей — «Идёт · II пара», отсчёт с полосой и «Дальше».
 *
 * Пропуски и заметки — как раньше на сайте, только у своей группы и только если
 * человек включил их в Кабинете. Формат хранения — lib/studyData.ts.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DAYS_ORDER } from "@/lib/api";
import { skipKey, noteWeeklyKey, noteDatedKey } from "@/lib/studyData";
import {
  attendanceApplies, dayTitle, isoOf, type Block, type DayData, type Focus,
} from "@/lib/tablo/schedule";
import { answerOf, myGroupId, personsOf, useFullNames } from "@/lib/fullNames";
import TeacherName from "../names/TeacherName";
import Icon from "../Icon";
import { Countdown, leftText, TypeBadge, kindTone } from "./parts";

function StudyTools({ block, groupId, attendance, notes, now }: {
  block: Block;
  groupId: number;
  attendance: boolean;
  notes: boolean;
  now: Date | null;
}) {
  const l = block.lessons[0];
  const date = block.date;
  const pairs = block.pairs;
  // Пропуск — на каждую пару сдвоенной отдельно (нельзя пропустить половину), как раньше.
  const canSkip = attendance && attendanceApplies(l.lesson_type) && !!now && date <= isoOf(now);
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [weekly, setWeekly] = useState(true);
  const kWeekly = noteWeeklyKey(groupId, l.day_of_week, pairs[0]);
  const kDated = noteDatedKey(groupId, date, pairs[0]);

  useEffect(() => {
    const s: Record<string, boolean> = {};
    for (const p of pairs) s[p] = localStorage.getItem(skipKey(groupId, date, p)) !== null;
    setSkipped(s);
    const dated = localStorage.getItem(kDated);
    if (dated !== null) { setNote(dated); setWeekly(false); }
    else { setNote(localStorage.getItem(kWeekly) ?? ""); setWeekly(true); }
  }, [groupId, date, pairs, kDated, kWeekly]);

  const toggleSkip = (p: string) => {
    const k = skipKey(groupId, date, p);
    if (skipped[p]) localStorage.removeItem(k);
    else localStorage.setItem(k, l.subject); // в значении — предмет, для статистики в Кабинете
    setSkipped(s => ({ ...s, [p]: !s[p] }));
  };

  const persist = (text: string, repeat: boolean) => {
    localStorage.removeItem(kDated);
    localStorage.removeItem(kWeekly);
    if (text.trim()) localStorage.setItem(repeat ? kWeekly : kDated, text);
  };

  if (!canSkip && !notes) return null;
  return (
    <div className="t-study">
      {canSkip && (
        <div className="flex flex-wrap gap-2">
          {pairs.map(p => (
            <button key={p} type="button" aria-pressed={!!skipped[p]} onClick={() => toggleSkip(p)}
              className={`t-chip-btn ${skipped[p] ? "t-chip-on" : ""}`}>
              {skipped[p] ? "Пропущено" : "Отметить пропуск"}{pairs.length > 1 ? ` · ${p} пара` : ""}
            </button>
          ))}
        </div>
      )}
      {notes && (
        <div>
          <label className="t-over block mb-1.5" htmlFor={`note-${block.key}`}>Заметка</label>
          <textarea
            id={`note-${block.key}`}
            rows={2}
            value={note}
            placeholder="Что задали? Что принести на пару?"
            onChange={e => { setNote(e.target.value); persist(e.target.value, weekly); }}
            className="t-input"
          />
          <label className="flex items-center gap-2 mt-1.5 text-[14px] text-[var(--text-2)] cursor-pointer">
            <input type="checkbox" checked={weekly} onChange={e => { setWeekly(e.target.checked); persist(note, e.target.checked); }}
              className="w-4 h-4 accent-[var(--fill)]" />
            Повторять каждую неделю
          </label>
        </div>
      )}
    </div>
  );
}

export default function LessonDetails({ block, focus, days, now, onClose, study, hint }: {
  block: Block;
  focus: Focus | null;
  days: DayData[];
  now: Date | null;
  onClose: () => void;
  /** Пропуски и заметки — только своя группа и включено в Кабинете. */
  study: { groupId: number; attendance: boolean; notes: boolean } | null;
  hint: string | null;
}) {
  const l = block.lessons[0];
  const live = !!focus && focus.filled && focus.block.key === block.key;
  const t = now?.getTime() ?? 0;
  const titleRef = useRef<HTMLHeadingElement>(null);

  const dayIdx = DAYS_ORDER.indexOf(l.day_of_week);
  const pairsText = block.pairs.length > 1 ? `${block.pairs.join(" и ")} пары` : `${block.pairs[0]} пара`;
  const kind = kindTone(l.lesson_type);

  // Полные имена: кнопка «раскрыть» и «Знаете полное имя?» — у своей группы,
  // пока имя не утверждено и человек ещё не отвечал (lib/fullNames.ts)
  const fullNames = useFullNames();
  const [askName, setAskName] = useState(false);
  useEffect(() => {
    const ps = personsOf(l.teacher?.name);
    setAskName(ps.length === 1 && !!fullNames && !fullNames.names[ps[0]]
      && !!l.group && l.group.id === myGroupId() && !answerOf(ps[0]));
  }, [l, fullNames]);

  // «Дальше» у идущей: следующая пара сегодня.
  const after = live ? days.flatMap(d => d.blocks).find(b => b.date === block.date && b.startAt >= block.endAt) : undefined;

  return (
    <div className="t-panel t-details">
      <div className="flex items-start justify-between gap-2">
        {live && focus ? (
          <span className="t-pill t-pill-soft"><i className="t-live-dot" aria-hidden="true" />{focus.pill}</span>
        ) : (
          <TypeBadge type={l.lesson_type} />
        )}
        <button type="button" onClick={onClose} aria-label="Закрыть" className="t-icon-btn -mt-2 -mr-2">
          <Icon name="close" size={22} />
        </button>
      </div>
      <h2 ref={titleRef} className="t-details-title">{l.subject}</h2>

      {live && focus?.targetAt != null && focus.progressFrom != null && (
        <div className="t-details-live">
          <div className="flex items-end justify-between gap-2">
            <Countdown ms={focus.targetAt - t} label="до конца" />
            <span className="text-[15px] text-[var(--text-2)] tabular-nums">до {block.end}</span>
          </div>
          <span className="t-details-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.max(0, ((t - focus.progressFrom) / (focus.targetAt - focus.progressFrom)) * 100))}%` }} />
          </span>
        </div>
      )}

      <div className="t-details-rows">
        <div className="t-drow">
          <Icon name="clock" size={22} />
          <span>
            <span className="t-drow-cap">{dayTitle(block.date)} · {pairsText}</span>
            <span className="t-drow-val tabular-nums">{block.start}–{block.end}</span>
          </span>
        </div>
        {l.teacher ? (
          <Link href={`/teachers?teacher=${l.teacher.id}${askName ? "&poll=1" : ""}`} className="t-drow t-drow-link">
            <Icon name="user" size={22} />
            <span>
              <span className="t-drow-cap">Преподаватель{live && kind ? ` · ${kind.label}` : ""}</span>
              <span className="t-drow-val"><TeacherName name={l.teacher.name} data={fullNames} /></span>
              {askName && <span className="t-fn-ask">Знаете полное имя? →</span>}
            </span>
            <Icon name="chevronRight" size={20} className="t-drow-chev" />
          </Link>
        ) : null}
        {l.room ? (
          <Link
            href={`/rooms?day=${encodeURIComponent(DAYS_ORDER[dayIdx] ?? "")}&pair=${block.pairs[0]}&room=${encodeURIComponent(l.room.name)}`}
            className="t-drow t-drow-link"
          >
            <Icon name="pin" size={22} />
            <span>
              <span className="t-drow-cap">Аудитория</span>
              <span className="t-drow-val">{l.room.name}</span>
            </span>
            <Icon name="chevronRight" size={20} className="t-drow-chev" />
          </Link>
        ) : (
          <div className="t-drow">
            <Icon name="pin" size={22} />
            <span>
              <span className="t-drow-cap">Аудитория</span>
              <span className="t-drow-val">не указана</span>
            </span>
          </div>
        )}
        {after && (
          <div className="t-drow t-drow-sep">
            <Icon name="clock" size={22} />
            <span>
              <span className="t-drow-cap">Дальше · {after.pairs[0]} пара · через {leftText(after.startAt - t)}</span>
              <span className="t-drow-val">{after.lessons[0].subject}{after.lessons[0].room ? ` · ${after.lessons[0].room.name}` : ""}</span>
            </span>
          </div>
        )}
      </div>

      {study && <StudyTools block={block} groupId={study.groupId} attendance={study.attendance} notes={study.notes} now={now} />}

      {hint && <p className="t-details-hint">{hint}</p>}
    </div>
  );
}
