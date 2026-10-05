"use client";
/**
 * Экран «Внешний вид» (/profile/appearance) — как в приложении: пример сверху
 * (на широком экране — справа, стоит на месте), затем Акцент с подписями,
 * Типы занятий, Фон, Плотность карточек и «Сбросить оформление». Всё
 * применяется сразу (lib/appearance.ts), ключ `appearance` тот же, что в
 * приложении. Отличие сайта: у типов занятий есть свой цвет («+»).
 */
import { useState } from "react";
import Icon from "../Icon";
import { Popover } from "../Overlay";
import ColorPicker from "./ColorPicker";
import {
  ACCENT_PRESETS, DEFAULT_TYPES, TYPE_SHADES, accentHex, isCustomShade, accentVars, presetVars, resetAppearance,
  resolveMode, saveAppearance, type AccentPresetId, type Appearance, type Background, type Density, type ShadeValue, type TypeShades,
} from "@/lib/appearance";
import { contrast } from "@/lib/color";
import { useAppearance } from "@/lib/tablo/hooks";

const BGS: Background[] = ["system", "light", "dark", "black"];
/** Подписи как в приложении (раздел «Фон»). */
export const BG_LABEL: Record<Background, string> = { system: "Как в системе", light: "Светлый", dark: "Тёмный", black: "Чёрный" };

const TYPE_ROWS: Array<{ key: keyof TypeShades; label: string; tone: string }> = [
  { key: "lecture", label: "Лекция", tone: "lec" },
  { key: "practice", label: "Практика", tone: "lab" },
  { key: "exam", label: "Экзамен · Зачёт", tone: "exam" },
];

const PRESET_NAME: Record<AccentPresetId, string> = {
  blue: "Синий", violet: "Фиолетовый", emerald: "Изумруд", teal: "Бирюзовый", pink: "Розовый",
  orange: "Оранжевый", yellow: "Жёлтый", graphite: "Графит",
};

/** «Как в системе · бирюзовый» — подпись строки «Внешний вид» в Кабинете. */
export function appearanceSummary(a: Appearance): string {
  const accent = a.accent.preset === "custom" ? "свой цвет" : PRESET_NAME[a.accent.preset].toLowerCase();
  return `${BG_LABEL[a.background]} · ${accent}`;
}

function onAccentLine(a: Appearance, mode: ReturnType<typeof resolveMode>): string {
  const v = accentVars(a, mode);
  const ratio = (Math.round(contrast(v.onFill, v.fill) * 10) / 10).toFixed(1).replace(".", ",");
  return `Текст на акценте — ${v.onFill.toUpperCase() === "#FFFFFF" ? "белый" : "чёрный"} · ${ratio} : 1`;
}

function BgTile({ bg }: { bg: Background }) {
  return (
    <span className={`t-ap-bg t-ap-bg-${bg}`} aria-hidden="true">
      {bg === "system" && <i />}
      <b /><u /><s />
    </span>
  );
}

/** Живой пример: идущая пара, строки дня, аудитория и бейджи типов. */
function Preview() {
  return (
    <div className="t-ap-stage">
      <div className="t-ap-live">
        <div className="t-ap-live-top">
          <span><i />Идёт · II пара</span>
          <em>до конца <b>52</b> мин</em>
        </div>
        <div className="t-ap-live-mid">
          <div><strong>09:45</strong><small>до 11:15</small></div>
          <div className="t-ap-live-room"><small>Аудитория</small><b>702</b></div>
        </div>
        <p>Численные методы</p>
        <div className="t-ap-live-meta"><span className="t-badge t-badge-onfill">Практика</span>Хайбуллоев Д.А.</div>
        <span className="t-ap-bar"><i /></span>
      </div>
      <div className="t-ap-rows">
        {[
          ["11:30", "13:00", "III", "Практический курс на ЭВМ", "lab", "Практика", "Харисова М.А.", "105"],
          ["14:00", "15:30", "IV", "Численные методы", "lec", "Лекция", "Попов А.В.", "403"],
          ["15:45", "17:15", "V", "Численные методы", "exam", "Экзамен", "Попов А.В.", "403"],
        ].map(([s, e, p, subj, tone, type, teacher, room]) => (
          <div key={p}>
            <span><b>{s}</b><small>{e}</small><small>{p} пара</small></span>
            <span><strong>{subj}</strong><em><i className={`t-badge t-tone-${tone}`}>{type}</i>{teacher}</em></span>
            <b>{room}</b>
          </div>
        ))}
      </div>
      <div className="t-ap-roomtile">
        <b>702</b>
        <span><em>Занята до 15:30</em>3 курс ПМиИ · Численные методы</span>
        <Icon name="chevronRight" size={20} />
      </div>
      <div className="t-ap-badges">
        <span className="t-badge t-tone-lec">Лекция</span>
        <span className="t-badge t-tone-lab">Практика</span>
        <span className="t-badge t-tone-exam">Экзамен · Зачёт</span>
      </div>
    </div>
  );
}

export default function AppearanceView() {
  const a = useAppearance();
  const [plus, setPlus] = useState<HTMLButtonElement | null>(null);
  const [custom, setCustom] = useState(false);
  // Свой цвет типа занятия: какой тип и у какой точки «+» стоит окно
  const [typeCustom, setTypeCustom] = useState<{ key: keyof TypeShades; el: HTMLElement } | null>(null);
  if (!a) return null;
  const mode = resolveMode(a.background);
  const types = a.types ?? DEFAULT_TYPES;
  const density: Density = a.density ?? "regular";
  const customOn = a.accent.preset === "custom";

  const save = (next: Partial<Appearance>) => saveAppearance({ ...a, ...next });
  const pick = (id: AccentPresetId) => save({ accent: { ...a.accent, preset: id } });
  const setType = (key: keyof TypeShades, id: ShadeValue) => save({ types: { ...types, [key]: id } });

  return (
    <div className="t-av">
      <aside className="t-av-prev" aria-label="Так это выглядит"><Preview /></aside>

      <div className="t-av-set">
        <h2 className="t-over t-av-h">Акцент</h2>
        <section className="t-av-card">
          <div className="t-ap-swatches" role="radiogroup" aria-label="Цвет акцента">
            {ACCENT_PRESETS.map(p => {
              const on = a.accent.preset === p.id;
              const v = presetVars(p.id, mode);
              return (
                <button key={p.id} type="button" role="radio" aria-checked={on} aria-label={PRESET_NAME[p.id]}
                  className={`t-ap-sw ${on ? "t-ap-sw-on" : ""}`} onClick={() => pick(p.id)}>
                  <span style={{ background: v.fill, color: v.onFill }}>{on && <Icon name="check" size={22} strokeWidth={2.6} />}</span>
                  <em>{PRESET_NAME[p.id]}</em>
                </button>
              );
            })}
            <button ref={setPlus} type="button" role="radio" aria-checked={customOn} aria-label="Свой цвет"
              className={`t-ap-sw ${customOn ? "t-ap-sw-on" : ""}`} onClick={() => setCustom(o => !o)}>
              <span className="t-ap-plus" style={customOn ? { background: accentHex(a), color: accentVars(a, mode).onFill } : undefined}>
                {customOn ? <Icon name="check" size={22} strokeWidth={2.6} /> : <b>+</b>}
              </span>
              <em>Свой</em>
            </button>
          </div>
          <p className="t-ap-note">{onAccentLine(a, mode)}</p>
        </section>

        <h2 className="t-over t-av-h">Типы занятий</h2>
        <section className="t-av-card t-ap-types">
          {TYPE_ROWS.map(r => (
            <div key={r.key} className="t-ap-type">
              <span className={`t-badge t-tone-${r.tone}`}>{r.label}</span>
              <div role="radiogroup" aria-label={r.label}>
                {TYPE_SHADES.map(s => {
                  const on = types[r.key] === s.id;
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={on} aria-label={s.name} title={s.name}
                      className={`t-ap-dot ${on ? "t-ap-dot-on" : ""}`} onClick={() => setType(r.key, s.id)}>
                      <span style={{ background: s.hex }} />
                    </button>
                  );
                })}
                {(() => {
                  const v = types[r.key];
                  const on = isCustomShade(v);
                  return (
                    <button type="button" role="radio" aria-checked={on} aria-label="Свой цвет" title="Свой цвет"
                      className={`t-ap-dot ${on ? "t-ap-dot-on" : ""}`}
                      onClick={e => setTypeCustom({ key: r.key, el: e.currentTarget })}>
                      <span className={on ? "" : "t-ap-dot-plus"} style={on ? { background: v } : undefined}>
                        {on ? null : <b>+</b>}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
          ))}
        </section>

        <h2 className="t-over t-av-h">Фон</h2>
        <section className="t-av-card">
          <div className="t-ap-bgs" role="radiogroup" aria-label="Фон">
            {BGS.map(bg => (
              <button key={bg} type="button" role="radio" aria-checked={a.background === bg}
                className={`t-ap-bgbtn ${a.background === bg ? "t-ap-bgbtn-on" : ""}`} onClick={() => save({ background: bg })}>
                <BgTile bg={bg} />
                <span>{BG_LABEL[bg]}</span>
              </button>
            ))}
          </div>
        </section>

        <h2 className="t-over t-av-h">Плотность карточек</h2>
        <section className="t-av-card">
          <div className="t-ap-dens" role="radiogroup" aria-label="Плотность карточек">
            {(["regular", "compact"] as const).map(d => (
              <button key={d} type="button" role="radio" aria-checked={density === d}
                className={`t-ap-denbtn ${density === d ? "t-ap-denbtn-on" : ""}`} onClick={() => save({ density: d })}>
                <span className={`t-ap-denpic ${d === "compact" ? "t-ap-denpic-c" : ""}`} aria-hidden="true">
                  {[0, 1, 2].map(i => <i key={i}><b /><u /><b /></i>)}
                </span>
                <span>{d === "regular" ? "Обычная" : "Компактная"}</span>
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="t-ap-reset" onClick={() => resetAppearance()}>Сбросить оформление</button>
      </div>

      {typeCustom && (() => {
        const row = TYPE_ROWS.find(r => r.key === typeCustom.key)!;
        const cur = types[typeCustom.key];
        const start = isCustomShade(cur) ? cur : (TYPE_SHADES.find(x => x.id === cur)?.hex ?? "#4FB3FF");
        return (
          <Popover anchor={typeCustom.el} onClose={() => setTypeCustom(null)} width={420} label="Свой цвет типа занятия" autoFocus={false}>
            <div className="t-panel">
              <ColorPicker
                initial={start}
                type={{ label: row.label, mode }}
                onCancel={() => setTypeCustom(null)}
                onApply={hex => { setType(typeCustom.key, hex as ShadeValue); setTypeCustom(null); }}
              />
            </div>
          </Popover>
        );
      })()}

      {custom && (
        <Popover anchor={plus} onClose={() => setCustom(false)} width={420} label="Свой цвет" autoFocus={false}>
          <div className="t-panel">
            <ColorPicker
              initial={a.accent.custom ?? accentHex(a)}
              onCancel={() => setCustom(false)}
              onApply={hex => { save({ accent: { preset: "custom", custom: hex } }); setCustom(false); }}
            />
          </div>
        </Popover>
      )}
    </div>
  );
}
