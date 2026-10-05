"use client";
/**
 * «Внешний вид» в Кабинете (макеты kabinet-1…3): акцент (8 готовых и «Свой»),
 * оттенки типов занятий, фон, плотность карточек, «Сбросить оформление» и
 * живой пример «Так это выглядит». Всё применяется сразу (lib/appearance.ts),
 * ключ `appearance` тот же, что в приложении.
 */
import { useState } from "react";
import Icon from "../Icon";
import { Popover } from "../Overlay";
import ColorPicker from "./ColorPicker";
import {
  ACCENT_PRESETS, BACKGROUND_NAMES, DEFAULT_TYPES, TYPE_SHADES, accentHex, isCustomShade, shadePair, accentVars, presetVars, resetAppearance,
  resolveMode, saveAppearance, type AccentPresetId, type Appearance, type Background, type Density, type ShadeValue, type TypeShades,
} from "@/lib/appearance";
import { contrast } from "@/lib/color";
import { useAppearance } from "@/lib/tablo/hooks";

const BGS: Background[] = ["system", "light", "dark", "black"];

const TYPE_ROWS: Array<{ key: keyof TypeShades; label: string; tone: string }> = [
  { key: "lecture", label: "Лекция", tone: "lec" },
  { key: "practice", label: "Практика", tone: "lab" },
  { key: "exam", label: "Экзамен · Зачёт", tone: "exam" },
];

const PRESET_NAME: Record<AccentPresetId, string> = {
  blue: "Синий", violet: "Фиолетовый", emerald: "Изумруд", teal: "Бирюзовый", pink: "Розовый",
  orange: "Оранжевый", yellow: "Жёлтый", graphite: "Графит",
};

function accentLine(a: Appearance, mode: ReturnType<typeof resolveMode>): string {
  const v = accentVars(a, mode);
  const name = a.accent.preset === "custom" ? "Свой цвет" : PRESET_NAME[a.accent.preset];
  const ratio = (Math.round(contrast(v.onFill, v.fill) * 10) / 10).toFixed(1).replace(".", ",");
  return `${name} · текст на акценте — ${v.onFill.toUpperCase() === "#FFFFFF" ? "белый" : "чёрный"} · ${ratio} : 1`;
}

function BgTile({ bg }: { bg: Background }) {
  const split = bg === "system";
  return (
    <span className={`t-ap-bg t-ap-bg-${bg}`} aria-hidden="true">
      {split && <i />}
      <b /><u />
    </span>
  );
}

export default function AppearanceCard() {
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
    <section className="t-ap" aria-label="Внешний вид">
      <div className="t-ap-main">
        <h2 className="t-ap-title">Внешний вид</h2>

        <p className="t-over">Акцент</p>
        <div className="t-ap-swatches" role="radiogroup" aria-label="Цвет акцента">
          {ACCENT_PRESETS.map(p => {
            const on = a.accent.preset === p.id;
            const v = presetVars(p.id, mode);
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on} aria-label={PRESET_NAME[p.id]} title={PRESET_NAME[p.id]}
                className={`t-ap-sw ${on ? "t-ap-sw-on" : ""}`} onClick={() => pick(p.id)}>
                <span style={{ background: v.fill, color: v.onFill }}>{on && <Icon name="check" size={20} strokeWidth={2.6} />}</span>
              </button>
            );
          })}
          <button ref={setPlus} type="button" role="radio" aria-checked={customOn} aria-label="Свой цвет" title="Свой цвет"
            className={`t-ap-sw ${customOn ? "t-ap-sw-on" : ""}`} onClick={() => setCustom(o => !o)}>
            <span className="t-ap-plus" style={customOn ? { background: accentHex(a), color: accentVars(a, mode).onFill } : undefined}>
              {customOn ? <Icon name="check" size={20} strokeWidth={2.6} /> : <b>+</b>}
            </span>
          </button>
        </div>
        <p className="t-ap-note">{accentLine(a, mode)}</p>

        <p className="t-over">Типы занятий</p>
        <div className="t-ap-types">
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
        </div>

        <p className="t-over">Фон</p>
        <div className="t-ap-bgs" role="radiogroup" aria-label="Фон">
          {BGS.map(bg => (
            <button key={bg} type="button" role="radio" aria-checked={a.background === bg}
              className={`t-ap-bgbtn ${a.background === bg ? "t-ap-bgbtn-on" : ""}`} onClick={() => save({ background: bg })}>
              <BgTile bg={bg} />
              <span>{bg === "system" ? "Как в системе" : BACKGROUND_NAMES[bg]}</span>
            </button>
          ))}
        </div>

        <p className="t-over">Плотность карточек</p>
        <div className="t-ap-dens" role="radiogroup" aria-label="Плотность карточек">
          {(["regular", "compact"] as const).map(d => (
            <button key={d} type="button" role="radio" aria-checked={density === d}
              aria-label={d === "regular" ? "Обычная" : "Компактная"}
              className={`t-ap-denbtn ${density === d ? "t-ap-denbtn-on" : ""}`} onClick={() => save({ density: d })}>
              <i /><i /><i className="t-ap-short" />
              {d === "compact" && <i className="t-ap-tight" />}
            </button>
          ))}
        </div>

        <button type="button" className="t-ap-reset" onClick={() => resetAppearance()}>Сбросить оформление</button>
      </div>

      <aside className="t-ap-prev" aria-label="Так это выглядит">
        <p className="t-over">Так это выглядит</p>
        <div className="t-ap-stage">
          <div className="t-ap-live">
            <div className="t-ap-live-top">
              <span><i />Идёт · II пара</span>
              <em>до конца <b>52</b> мин</em>
            </div>
            <div className="t-ap-live-mid">
              <strong>09:45</strong>
              <b>702</b>
            </div>
            <small>до 11:15</small>
            <p>Численные методы</p>
            <span className="t-ap-bar"><i /></span>
          </div>
          <div className="t-ap-rows">
            <div>
              <span><b>11:30</b><small>III пара</small></span>
              <span><strong>Практический курс на ЭВМ</strong><em className="t-badge t-tone-lab">Практика</em></span>
              <b>105</b>
            </div>
            <div>
              <span><b>15:45</b><small>V пара</small></span>
              <span><strong>Численные методы</strong><em className="t-badge t-tone-exam">Экзамен</em></span>
              <b>403</b>
            </div>
          </div>
        </div>
      </aside>

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
    </section>
  );
}
