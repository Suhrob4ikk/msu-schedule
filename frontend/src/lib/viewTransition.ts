"use client";

import type { MouseEvent } from "react";
import type { useRouter } from "next/navigation";

/** startViewTransition есть не во всех браузерах и не во всех версиях типов DOM. */
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

/**
 * Оборачивает переход между страницами в View Transitions API — тот же
 * приём, что уже используется для смены темы (lib/theme.ts). Пока идёт
 * переход, на <html> висит класс `page-transitioning`: по нему globals.css
 * исключает шапку и нижнюю навигацию из общего кросс-фейда (у них свой
 * view-transition-name и мгновенная подмена — крутится только контент
 * страницы). Без поддержки API или при «уменьшить движение» — переход
 * происходит как обычно, мгновенно, ничего не ломается.
 */
export function startViewTransitionNav(navigate: () => void): void {
  const doc = document as DocumentWithViewTransition;
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion || typeof doc.startViewTransition !== "function") {
    navigate();
    return;
  }

  root.classList.add("page-transitioning");
  doc.startViewTransition(navigate).finished.finally(() => {
    root.classList.remove("page-transitioning");
  });
}

/**
 * onClick для <Link>, включающий переход выше. Обычный клик левой кнопкой —
 * плавный переход; Ctrl/Cmd/Shift/средняя кнопка — отдаём браузеру как есть
 * (открыть в новой вкладке и т.п.), иначе такие клики молча ломались бы.
 */
export function viewTransitionNavClick(
  router: ReturnType<typeof useRouter>,
  href: string,
) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    startViewTransitionNav(() => router.push(href));
  };
}
