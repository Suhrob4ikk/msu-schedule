"use client";
/**
 * «Вход» (макеты vhod-*): карточка с выбором группы — направление и курс
 * чипами, имя для аватара, «Открыть расписание» (Enter) — и справа пример
 * завтрашнего дня выбранной группы. Тот же экран открывается из Кабинета
 * («Изменить имя или группу»), тогда кнопка называется «Сохранить».
 */
import { useEffect, useMemo, useState } from "react";
import { api, DAYS_ORDER, shortGroupName, type Group, type Lesson } from "@/lib/api";
import { addDays, dayTitle, dushanbeNow, isoOf, plural } from "@/lib/tablo/schedule";

const DIRECTION_ORDER = ["ПМиИ", "ХФММ", "Геология", "МО", "Лингвистика", "ГМУ"];

/** Ближайший учебный день после сегодня и его пары (из текущей недели группы). */
function nextDay(lessons: Lesson[]): { title: string; tomorrow: boolean; pairs: Lesson[] } | null {
  if (!lessons.length) return null;
  const today = isoOf(dushanbeNow());
  const dated = lessons.filter(l => l.lesson_date);
  const dates = [...new Set(dated.map(l => l.lesson_date as string))].sort();
  const date = dates.find(d => d > today) ?? dates[0];
  if (date) {
    return {
      title: dayTitle(date).toLowerCase(),
      tomorrow: date === addDays(today, 1),
      pairs: dated.filter(l => l.lesson_date === date).sort((x, y) => x.pair_time_start.localeCompare(y.pair_time_start)),
    };
  }
  const dow = (dushanbeNow().getDay() + 6) % 7;
  const names = [...new Set(lessons.map(l => l.day_of_week.toLowerCase()))].sort((a, b) => DAYS_ORDER.indexOf(a) - DAYS_ORDER.indexOf(b));
  const name = names.find(n => DAYS_ORDER.indexOf(n) > dow) ?? names[0];
  return { title: name, tomorrow: false, pairs: lessons.filter(l => l.day_of_week.toLowerCase() === name) };
}

function Preview({ group }: { group: Group | null }) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const gid = group?.id;
  useEffect(() => {
    if (!gid) return;
    let alive = true;
    setLessons(null);
    api.getGroupSchedule(gid).then(ls => { if (alive) setLessons(ls); }).catch(() => { if (alive) setLessons([]); });
    return () => { alive = false; };
  }, [gid]);
  const day = useMemo(() => (lessons ? nextDay(lessons) : null), [lessons]);

  if (!group) return <aside className="t-lg-prev t-lg-prev-empty"><p>Выберите направление и курс, и здесь появится ваше завтра</p></aside>;
  const first = day?.pairs[0];
  const rest = day?.pairs.slice(1, 3) ?? [];
  return (
    <aside className="t-lg-prev" aria-label="Пример расписания">
      <p className="t-over">{day?.tomorrow ? "Завтра" : "Ближайший день"} · {shortGroupName(group.name)} · {group.year} курс</p>
      {lessons === null ? (
        <div className="t-skel t-skel-block" style={{ height: 200 }} />
      ) : !day || !first ? (
        <p className="t-lg-sub">Пар на этой неделе нет</p>
      ) : (
        <>
          <p className="t-lg-sub">{day.title} · {day.pairs.length} {plural(day.pairs.length, "пара", "пары", "пар")}</p>
          <div className="t-lg-next">
            <span className="t-lg-pill">Первая пара · {first.pair_number}</span>
            <div><strong>{first.pair_time_start}</strong><b>{first.room?.name ?? ""}</b></div>
            <p>{first.subject}</p>
          </div>
          {rest.length > 0 && (
            <div className="t-lg-rows">
              {rest.map(l => (
                <div key={l.id}>
                  <span><b>{l.pair_time_start}</b><small>{l.pair_number} пара</small></span>
                  <strong>{l.subject}</strong>
                  <b>{l.room?.name ?? ""}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <p className="t-lg-foot">Так будет выглядеть ваше расписание</p>
    </aside>
  );
}

export default function Login({ groups, groupsError, onRetry, name, onName, group, onGroup, saving, isSetup, onSave, onCancel }: {
  groups: Group[];
  groupsError: boolean;
  onRetry: () => void;
  name: string;
  onName: (v: string) => void;
  group: Group | null;
  onGroup: (g: Group) => void;
  saving: boolean;
  isSetup: boolean;
  onSave: () => void;
  onCancel?: () => void;
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
    const g = options.find(x => x.year === group?.year) ?? options[0];
    if (g) onGroup(g);
  };

  return (
    <div className="t-lg">
      <form className="t-lg-card" onSubmit={e => { e.preventDefault(); if (group && !saving) onSave(); }}>
        <div className="t-lg-form">
          <div className="t-lg-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- маленький статичный знак */}
            <img src="/logo.png" alt="" width={56} height={56} />
            <div><b>МГУ Душанбе</b><span>Расписание</span></div>
          </div>
          <h1>{isSetup ? "Выберите группу" : "Группа и имя"}</h1>

          {groupsError && !groups.length ? (
            <div className="t-lg-err">
              <span>Список групп не загрузился: нет связи с сервером.</span>
              <button type="button" onClick={onRetry}>Повторить</button>
            </div>
          ) : (
            <>
              <p className="t-over">Направление</p>
              <div className="t-chips" role="radiogroup" aria-label="Направление">
                {directions.map(d => (
                  <button key={d} type="button" role="radio" aria-checked={d === dir}
                    className={`t-chip ${d === dir ? "t-chip-sel" : ""}`} onClick={() => pickDirection(d)}>{d}</button>
                ))}
              </div>
              <p className="t-over">Курс</p>
              <div className="t-chips" role="radiogroup" aria-label="Курс">
                {(dir ? courses : [1, 2, 3, 4]).map(y => (
                  <button key={y} type="button" role="radio" aria-checked={y === group?.year} disabled={!dir}
                    className={`t-chip ${y === group?.year ? "t-chip-sel" : ""}`}
                    onClick={() => { const g = groups.find(x => shortGroupName(x.name) === dir && x.year === y); if (g) onGroup(g); }}>
                    {y} курс
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="t-over" htmlFor="t-lg-name">Как вас зовут · необязательно</label>
          <input id="t-lg-name" className="t-lg-input" placeholder="Имя" value={name} maxLength={60}
            onChange={e => onName(e.target.value)} autoComplete="given-name" />

          <div className="t-lg-actions">
            <button type="submit" className="t-lg-go" disabled={!group || saving}>
              {saving ? "Сохраняем…" : isSetup ? "Открыть расписание" : "Сохранить"}
              {!saving && <kbd>Enter</kbd>}
            </button>
            {onCancel && <button type="button" className="t-btn-ghost" onClick={onCancel}>Отмена</button>}
          </div>
        </div>
        <Preview group={group} />
      </form>
    </div>
  );
}
