"use client";

/**
 * Тема: светлая, тёмная или «как в системе».
 *
 * Ключ localStorage тот же, что и раньше ('theme'), поэтому у тех, кто уже
 * выбрал тему вручную, ничего не сбросится. Отсутствие значения тоже
 * означает «как в системе» — так вело себя приложение и до появления
 * явного варианта. Класс `dark` на <html> ставит инлайновый скрипт в
 * layout.tsx (до первого кадра, чтобы не мигало), дальше — функции отсюда.
 */
import { silenceViewTransition, type ViewTransitionHandle } from "./viewTransition";

export type ThemePref = "light" | "dark" | "system";

export const THEME_KEY = "theme";

export function getThemePref(): ThemePref {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Какая тема должна быть сейчас при данной настройке. */
export function resolveDark(pref: ThemePref): boolean {
  return pref === "dark" || (pref === "system" && systemPrefersDark());
}

export function setThemePref(pref: ThemePref): void {
  // 'system' пишем явно, а не удаляем ключ: иначе не отличить «выбрал систему»
  // от «ещё ни разу не трогал», а инлайновый скрипт обрабатывает оба одинаково.
  localStorage.setItem(THEME_KEY, pref);
  document.documentElement.classList.toggle("dark", resolveDark(pref));
}

/** startViewTransition есть не во всех браузерах и не во всех версиях типов DOM. */
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionHandle;
};

/**
 * Ставит тему с круговым переходом (View Transitions API) от точки клика —
 * общая анимация для кнопки в шапке и чипов в кабинете, чтобы у обоих
 * контролов был одинаково «крутой» переход, а не только у одного из них.
 * Без поддержки API, без видимой смены цвета или при «уменьшить движение» —
 * применяет мгновенно.
 */
export function setThemePrefAnimated(pref: ThemePref, origin: { x: number; y: number }): void {
  const root = document.documentElement;
  const willBeDark = resolveDark(pref);
  const isDarkNow = root.classList.contains("dark");
  const apply = () => setThemePref(pref);

  const doc = document as DocumentWithViewTransition;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (willBeDark === isDarkNow || reduceMotion || typeof doc.startViewTransition !== "function") {
    apply();
    return;
  }

  // Новая тема расходится кругом от точки клика. Радиус — до самого
  // дальнего угла экрана, чтобы круг накрыл страницу целиком.
  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  root.style.setProperty("--reveal-x", `${origin.x}px`);
  root.style.setProperty("--reveal-y", `${origin.y}px`);
  root.style.setProperty("--reveal-r", `${radius}px`);
  root.classList.add("theme-switching");

  const transition = doc.startViewTransition(apply);
  silenceViewTransition(transition);
  transition.finished
    .finally(() => {
      root.classList.remove("theme-switching");
      // Убираем за собой: инлайновые переменные нужны только на время анимации
      root.style.removeProperty("--reveal-x");
      root.style.removeProperty("--reveal-y");
      root.style.removeProperty("--reveal-r");
    })
    .catch(() => { /* см. silenceViewTransition */ });
}

/**
 * Следить за сменой системной темы, пока выбрано «как в системе».
 * Возвращает функцию отписки.
 */
export function watchSystemTheme(onChange: (dark: boolean) => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => {
    if (getThemePref() !== "system") return;
    document.documentElement.classList.toggle("dark", e.matches);
    onChange(e.matches);
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
