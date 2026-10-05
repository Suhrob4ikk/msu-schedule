"use client";
/**
 * Окно «Свой цвет» (макет kabinet-3): квадрат насыщенность × яркость, полоса
 * оттенка, поле «Код цвета», пример «Aa» с контрастом и «Отмена | Применить».
 */
import { useRef, useState } from "react";
import Icon from "../Icon";
import { contrast, normalizeHex } from "@/lib/color";
import { accentVars, shadePair, type Mode, type ShadeValue } from "@/lib/appearance";

interface Hsv { h: number; s: number; v: number }

function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return "#" + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export default function ColorPicker({ initial, onApply, onCancel, type }: {
  initial: string;
  /** Выбор цвета типа занятия: пример — бейдж, а не кнопка на акценте. */
  type?: { label: string; mode: Mode };
  onApply: (hex: string) => void;
  onCancel: () => void;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(initial));
  const hex = hsvToHex(hsv);
  const [text, setText] = useState(hex);
  const sv = useRef<HTMLDivElement>(null);
  const hue = useRef<HTMLDivElement>(null);

  const set = (next: Hsv) => { setHsv(next); setText(hsvToHex(next)); };

  const drag = (ref: React.RefObject<HTMLDivElement | null>, move: (x: number, y: number) => void) => (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      move(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    at(e);
    const onMove = (ev: PointerEvent) => at(ev);
    const onUp = () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerup", onUp); };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const onText = (v: string) => {
    setText(v);
    const n = normalizeHex(v);
    if (n) setHsv(hexToHsv(n));
  };

  const vars = accentVars({ version: 1, accent: { preset: "custom", custom: hex }, background: "light" }, "light");
  const onWhite = vars.onFill.toUpperCase() === "#FFFFFF";
  const ratio = (Math.round(contrast(vars.onFill, vars.fill) * 10) / 10).toFixed(1).replace(".", ",");
  const valid = !!normalizeHex(text);
  const pair = type ? shadePair(hex as ShadeValue, type.mode) : null;
  const pairRatio = pair ? (Math.round(contrast(pair.text, pair.bg) * 10) / 10).toFixed(1).replace(".", ",") : "";

  return (
    <div className="t-cp">
      <div className="t-cp-head">
        <h2>Свой цвет</h2>
        <button type="button" className="t-icon-btn" onClick={onCancel} aria-label="Закрыть"><Icon name="close" size={22} /></button>
      </div>
      <div className="t-cp-sample">
        {pair && type ? (
          <>
            <span className="t-cp-badge" style={{ background: pair.bg, color: pair.text }}>{type.label}</span>
            <div>
              <b>{hex}</b>
              <small>Фон и текст подобраны сами · {pairRatio} : 1</small>
            </div>
          </>
        ) : (
          <>
            <span style={{ background: vars.fill, color: vars.onFill }}>Aa</span>
            <div>
              <b>{hex}</b>
              <small>Текст на акценте — {onWhite ? "белый" : "чёрный"} · {ratio} : 1</small>
            </div>
          </>
        )}
      </div>
      <div ref={sv} className="t-cp-sv" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={drag(sv, (x, y) => set({ ...hsv, s: x, v: 1 - y }))} role="presentation">
        <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div ref={hue} className="t-cp-hue" onPointerDown={drag(hue, x => set({ ...hsv, h: x * 359.9 }))} role="presentation">
        <i style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
      </div>
      <label className="t-over" htmlFor="t-cp-hex">Код цвета</label>
      <input id="t-cp-hex" className="t-cp-hex" value={text} maxLength={7} spellCheck={false}
        onChange={e => onText(e.target.value)} aria-invalid={!valid} />
      <div className="t-cp-actions">
        <button type="button" onClick={onCancel}>Отмена</button>
        <button type="button" className="t-cp-ok" disabled={!valid} onClick={() => onApply(normalizeHex(text) ?? hex)}>Применить</button>
      </div>
    </div>
  );
}
