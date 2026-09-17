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
  applyAccent(); // у синего акцента разные оттенки для светлой/тёмной темы
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
    applyAccent();
    onChange(e.matches);
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/**
 * Цвет акцента — отдельно от светлой/тёмной темы. «Изумруд» — фирменный
 * зелёный (по умолчанию, как было всегда), «Синий» — альтернативная палитра
 * для тех, кому синий привычнее как основной UI-акцент. Статус «свободно» /
 * «занято» на аудиториях зелёным/красным не завязан на этот выбор — те цвета
 * заданы отдельно (см. app/rooms/page.tsx), поэтому смена акцента их не трогает.
 *
 * Применяется через инлайн-стили на <html>, а не через CSS-класс/атрибут:
 * Tailwind 4 (Lightning CSS) при сборке выкидывал правило вида
 * `[data-accent="blue"] { --primary: ... }` как "неиспользуемое" — переменная
 * нигде не читалась внутри самого CSS-файла напрямую. Инлайн-стиль такой
 * оптимизации не подвержен в принципе.
 */
export type AccentPref = "green" | "blue";

export const ACCENT_KEY = "accent";

const BLUE_LIGHT = {
  "--primary": "#168bff",
  "--primary-strong": "#0a6fd6",
  "--primary-soft": "#e3f0ff",
  "--ring": "rgba(22, 139, 255, 0.35)",
};
const BLUE_DARK = {
  "--primary": "#2f9bff",
  "--primary-strong": "#5db4ff",
  "--primary-soft": "#0d2340",
  "--ring": "rgba(47, 155, 255, 0.4)",
};
const ACCENT_VARS = Object.keys(BLUE_LIGHT);

export function getAccentPref(): AccentPref {
  const saved = localStorage.getItem(ACCENT_KEY);
  return saved === "blue" ? "blue" : "green";
}

/** Пересчитывает инлайн-переменные акцента под текущие пару (акцент × тема).
 *  Нужно звать не только при смене акцента, но и при смене светлая/тёмная —
 *  у синего акцента для них разные оттенки (см. BLUE_LIGHT/BLUE_DARK). */
export function applyAccent(): void {
  const root = document.documentElement;
  const pref = getAccentPref();
  if (pref !== "blue") {
    ACCENT_VARS.forEach(k => root.style.removeProperty(k));
    return;
  }
  const vars = root.classList.contains("dark") ? BLUE_DARK : BLUE_LIGHT;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

export function setAccentPref(pref: AccentPref): void {
  localStorage.setItem(ACCENT_KEY, pref);
  applyAccent();
}
