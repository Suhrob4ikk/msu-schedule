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
