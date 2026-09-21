"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Всплывающая панель с подробностями.
 *
 * На телефоне — «шторка» снизу во всю ширину (большой палец дотягивается до
 * края экрана), на широком экране — окно по центру. Закрывается фоном,
 * крестиком и Escape. Пока панель открыта, фон под ней не прокручивается —
 * иначе на телефоне страница уезжает под шторкой.
 */
export default function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Рисуем через портал в <body>. Шапка сайта — sticky с z-50, и она создаёт
  // свой слой: любой оверлей, оставшийся внутри <main>, оказывается ПОД ней,
  // и шапка светится поверх затемнённого фона.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />

      <div className="anim-slide-up relative w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
        {/* Полоска-ручка: на телефоне сразу читается как «шторку можно закрыть» */}
        <div className="sm:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
        </div>

        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--foreground)" }}>
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-all active:scale-90 hover:text-[var(--foreground)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-6 sm:pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
