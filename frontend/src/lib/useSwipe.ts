"use client";

import { useRef, type TouchEvent } from "react";

/**
 * Горизонтальный свайп по расписанию — листать дни как карточки.
 *
 * Слушаем именно touch-события, а не указатель: свайп нужен только на
 * телефоне, на десктопе для этого есть кнопки дней. Вертикальное движение
 * игнорируем, иначе обычная прокрутка страницы отдавала бы ложные срабатывания.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      // Порог 60px и требование «горизонтальнее, чем вертикальнее» —
      // чтобы прокрутка страницы не считалась свайпом.
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft(); else onRight();
    },
  };
}
