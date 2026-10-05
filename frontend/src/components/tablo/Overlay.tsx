"use client";
/**
 * Всплывающие поверхности «Табло».
 *
 * Popover — панель у кнопки или ячейки (широкий экран): без затемнения,
 * закрывается Esc и кликом мимо, по Esc фокус возвращается на кнопку.
 * Sheet — шторка снизу (телефон): затемнение, ручка, Esc, фон не прокручивается.
 *
 * Обе рисуются через портал в <body>: шапка — sticky со своим слоем, и всё,
 * что осталось бы внутри страницы, оказалось бы под ней.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useMounted } from "@/lib/tablo/hooks";

const GAP = 8;
const EDGE = 12;

export function Popover({
  anchor, onClose, width = 400, placement = "below", align = "start", label, autoFocus = true, children,
}: {
  /** Кнопка или ячейка, рядом с которой стоит панель. */
  anchor: HTMLElement | null;
  onClose: () => void;
  width?: number;
  /** below — под кнопкой; side — справа от ячейки (если не влезает — слева). */
  placement?: "below" | "side";
  align?: "start" | "end";
  label: string;
  /** Переводить фокус в панель. У подробностей пары — нет: стрелки листают пары в сетке. */
  autoFocus?: boolean;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; w: number } | null>(null);

  const place = useCallback(() => {
    const el = ref.current;
    if (!anchor || !el) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - EDGE * 2);
    const h = el.offsetHeight;
    let left: number;
    let top: number;
    if (placement === "side") {
      left = r.right + GAP + w <= vw - EDGE ? r.right + GAP : r.left - GAP - w;
      if (left < EDGE) left = Math.min(Math.max(EDGE, r.left), vw - EDGE - w);
      top = r.top;
    } else {
      left = align === "end" ? r.right - w : r.left;
      top = r.bottom + GAP;
    }
    left = Math.min(Math.max(EDGE, left), vw - EDGE - w);
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - EDGE - h));
    setPos(p => (p && p.left === left && p.top === top && p.w === w ? p : { left, top, w }));
  }, [anchor, width, placement, align]);

  useLayoutEffect(() => { place(); });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
      anchor?.focus({ preventScroll: true });
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, onClose, place]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("button, a[href], input, [tabindex]:not([tabindex='-1'])");
    (first ?? el)?.focus({ preventScroll: true });
  }, [autoFocus]);

  if (!mounted) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className="t-pop fixed z-[80] outline-none"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? 0,
        width: pos?.w ?? width,
        maxHeight: "calc(100vh - 24px)",
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function Sheet({ onClose, label, title, children }: {
  onClose: () => void;
  label: string;
  /** Заголовок 22/800 и «Закрыть»; без него — только ручка. */
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const back = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      back?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Закрыть" tabIndex={-1} onClick={onClose} className="t-scrim absolute inset-0" />
      <div
        ref={ref}
        tabIndex={-1}
        className="t-sheet relative w-full max-w-[560px] max-h-[88vh] overflow-y-auto outline-none"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
          <span className="block w-10 h-1 rounded-full" style={{ background: "var(--line)" }} />
        </div>
        {title && (
          <div className="flex items-center gap-2 pl-4 pr-1">
            <div className="flex-1 min-w-0 text-[22px] font-extrabold leading-tight">{title}</div>
            <button type="button" onClick={onClose} aria-label="Закрыть" className="t-icon-btn">
              <Icon name="close" size={22} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
