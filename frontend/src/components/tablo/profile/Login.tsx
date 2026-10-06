"use client";
/**
 * «Вход» (макеты vhod-*): карточка с выбором группы — направление и курс
 * чипами, имя (обязательно), цвет оформления — и справа пример завтрашнего дня
 * выбранной группы в выбранном цвете. Новым пользователям по умолчанию
 * изумрудный (решение владельца, окт 2026). Тот же экран открывается из
 * Кабинета («Изменить имя или группу»), тогда кнопка называется «Сохранить».
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { Popover } from "../Overlay";
import ColorPicker from "./ColorPicker";
import { api, DAYS_ORDER, shortGroupName, type Group, type Lesson } from "@/lib/api";
import { addDays, dayTitle, dushanbeNow, isoOf, plural } from "@/lib/tablo/schedule";
import { displayRoom } from "@/lib/tablo/rooms";
import { ACCENT_PRESETS, accentHex, accentVars, presetVars, resolveMode, saveAppearance, type AccentPresetId } from "@/lib/appearance";
import { useAppearance } from "@/lib/tablo/hooks";

const ACCENT_NAME: Record<AccentPresetId, string> = {
  blue: "Синий", violet: "Фиолетовый", emerald: "Изумруд", teal: "Бирюзовый", pink: "Розовый",
  orange: "Оранжевый", yellow: "Жёлтый", graphite: "Графит",
};

/** «601 704» (пара в двух аудиториях) → «601, 704»; «стадион» → «Стадион». */
const roomLabel = (name: string | undefined) => (name ?? "").split(/\s+/).filter(Boolean).map(displayRoom).join(", ");
/** Длинное название — мельче, иначе не помещается рядом с временем и предметом. */
const roomCls = (label: string) => (label.length > 4 ? "t-lg-room-long" : "");

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

  if (!group) return <aside className="t-lg-prev t-lg-prev-empty"><p>Выберите направление и курс, и здесь появятся ваши пары на ближайший день</p></aside>;
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
            <div><strong>{first.pair_time_start}</strong><b className={roomCls(roomLabel(first.room?.name))}>{roomLabel(first.room?.name)}</b></div>
            <p>{first.subject}</p>
          </div>
          {rest.length > 0 && (
            <div className="t-lg-rows">
              {rest.map(l => (
                <div key={l.id}>
                  <span><b>{l.pair_time_start}</b><small>{l.pair_number} пара</small></span>
                  <strong>{l.subject}</strong>
                  <b className={roomCls(roomLabel(l.room?.name))}>{roomLabel(l.room?.name)}</b>
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
  // Цвет оформления: при первом входе — изумрудный, пока человек не выберет другой
  const a = useAppearance();
  const defaulted = useRef(false);
  useEffect(() => {
    if (!a || defaulted.current || !isSetup) return;
    defaulted.current = true;
    if (a.accent.preset === "blue") saveAppearance({ ...a, accent: { ...a.accent, preset: "emerald" } });
  }, [a, isSetup]);
  const mode = a ? resolveMode(a.background) : "light";
  const nameOk = name.trim().length > 0;
  // «Свой» цвет: окно с палитрой у кнопки «+»
  const [customAt, setCustomAt] = useState<HTMLElement | null>(null);
  // Нажали кнопку, не заполнив всё, — подсказываем, чего не хватает, и ставим курсор в поле имени
  const [tried, setTried] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const submit = () => {
    if (saving) return;
    if (!group || !nameOk) {
      setTried(true);
      if (group && !nameOk) nameRef.current?.focus();
      return;
    }
    onSave();
  };

  const pickDirection = (d: string) => {
    const options = groups.filter(g => shortGroupName(g.name) === d).sort((a, b) => a.year - b.year);
    const g = options.find(x => x.year === group?.year) ?? options[0];
    if (g) onGroup(g);
  };

  return (
    <div className="t-lg">
      <form className="t-lg-card" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
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
              {tried && !group && <p className="t-lg-hint" role="alert">Выберите направление и курс</p>}
            </>
          )}

          <label className="t-over" htmlFor="t-lg-name">Как вас зовут</label>
          <input ref={nameRef} id="t-lg-name" className={`t-lg-input ${tried && !nameOk ? "t-lg-input-err" : ""}`}
            placeholder="Имя" value={name} maxLength={60} required aria-invalid={tried && !nameOk}
            aria-describedby={tried && !nameOk ? "t-lg-name-err" : undefined}
            onChange={e => onName(e.target.value)} autoComplete="given-name" />
          {tried && !nameOk && <p id="t-lg-name-err" className="t-lg-hint" role="alert">Введите имя, чтобы открыть расписание</p>}

          {a && (
            <>
              <p className="t-over">Цвет оформления</p>
              <div className="t-lg-accents" role="radiogroup" aria-label="Цвет оформления">
                {ACCENT_PRESETS.map(p => {
                  const on = a.accent.preset === p.id;
                  const v = presetVars(p.id, mode);
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={on} aria-label={ACCENT_NAME[p.id]} title={ACCENT_NAME[p.id]}
                      className={`t-lg-acc ${on ? "t-lg-acc-on" : ""}`}
                      onClick={() => saveAppearance({ ...a, accent: { ...a.accent, preset: p.id } })}>
                      <span style={{ background: v.fill, color: v.onFill }}>{on && <Icon name="check" size={18} strokeWidth={2.6} />}</span>
                    </button>
                  );
                })}
                {(() => {
                  const on = a.accent.preset === "custom";
                  return (
                    <button type="button" role="radio" aria-checked={on} aria-label="Свой цвет" title="Свой цвет"
                      className={`t-lg-acc ${on ? "t-lg-acc-on" : ""}`}
                      onClick={e => { const el = e.currentTarget; setCustomAt(cur => (cur ? null : el)); }}>
                      <span className={on ? "" : "t-lg-acc-plus"} style={on ? { background: accentHex(a), color: accentVars(a, mode).onFill } : undefined}>
                        {on ? <Icon name="check" size={18} strokeWidth={2.6} /> : <b>+</b>}
                      </span>
                    </button>
                  );
                })()}
              </div>
              {customAt && (
                <Popover anchor={customAt} onClose={() => setCustomAt(null)} width={420} label="Свой цвет" autoFocus={false}>
                  <div className="t-panel">
                    <ColorPicker
                      initial={a.accent.custom ?? accentHex(a)}
                      onCancel={() => setCustomAt(null)}
                      onApply={hex => { saveAppearance({ ...a, accent: { preset: "custom", custom: hex } }); setCustomAt(null); }}
                    />
                  </div>
                </Popover>
              )}
            </>
          )}

          <div className="t-lg-actions">
            <button type="submit" className="t-lg-go" disabled={saving}>
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
