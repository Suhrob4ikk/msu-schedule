import html2canvas from "html2canvas";
import { Lesson, shortGroupName } from "./api";

// Фиксированные hex-цвета, а не CSS-переменные/Tailwind: html2canvas умеет
// не все современные цветовые функции (oklch из Tailwind 4), и снимок с ними
// вышел бы чёрно-белым. Поэтому палитры прописаны руками — но их две, и
// выбирается та же, в какой человек сейчас смотрит сайт: раньше картинка
// всегда была тёмной, и в светлой теме это выглядело как ошибка.
const DARK = {
  bg: "#0d0c13",
  card: "#18151f",
  border: "#2a2734",
  fg: "#f3f1f6",
  muted: "#8b8594",
};

const LIGHT = {
  bg: "#f3f5f8",
  card: "#ffffff",
  border: "#e6e9ee",
  fg: "#14181c",
  muted: "#5b6677",
};

// Цвет левой полоски и бейджа типа занятия — тот же принцип, что у
// .lesson-accent/.lesson-tag-* в globals.css, только продублирован тут
// руками: html2canvas не читает классы из настоящего стиля страницы.
const KIND_COLORS: Record<string, { light: string; dark: string; bgLight: string; bgDark: string }> = {
  exam: { light: "#c5303a", dark: "#ff8a8e", bgLight: "#fdeaeb", bgDark: "rgba(255,97,102,0.16)" },
  practice: { light: "#4a44c9", dark: "#b6b2f7", bgLight: "#ecebfb", bgDark: "rgba(140,135,243,0.18)" },
  lecture: { light: "#1d4ed8", dark: "#93c5fd", bgLight: "#eff6ff", bgDark: "rgba(59,130,246,0.16)" },
  default: { light: "#64748b", dark: "#94a3b8", bgLight: "#f1f5f9", bgDark: "rgba(148,163,184,0.16)" },
};

const KIND_BY_TYPE: Record<string, string> = {
  ЭКЗАМЕН: "exam", Экзамен: "exam", ЗАЧЕТ: "exam", Зачёт: "exam",
  ПРАКТИКА: "practice", Практика: "practice", ПЗ: "practice",
  ЛК: "lecture", ЛЕКЦИЯ: "lecture", Лекция: "lecture",
};

const TYPE_LABELS: Record<string, string> = {
  ЗАЧЕТ: "Зачёт", ЭКЗАМЕН: "Экзамен",
  ПРАКТИКА: "Практика", Практика: "Практика", ПЗ: "Практика",
  ЛК: "Лекция", ЛЕКЦИЯ: "Лекция", Лекция: "Лекция",
};

/** Тему берём с самой страницы: класс dark на <html> ставит layout.tsx.
 *  Акцент — тоже с неё же (--primary), чтобы картинка совпадала с тем,
 *  что человек выбрал в кабинете (синий по умолчанию или изумруд). */
function palette() {
  const dark = typeof document !== "undefined"
    && document.documentElement.classList.contains("dark");
  const base = dark ? DARK : LIGHT;
  const primary = (typeof document !== "undefined"
    && getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()) || "#2563eb";
  return { ...base, primary, dark };
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/**
 * Что писать в строке под предметом.
 *
 * В расписании группы человеку важно, КТО ведёт, — там преподаватель.
 * В расписании преподавателя он и так знает, кто это, и важно другое —
 * У КОГО пара. Поэтому там на том же месте группа.
 */
export type ShareSubtitle = "teacher" | "group";

/** Короткая метка недели для шапки картинки («1 – 7 сен»). */
export function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${start.getDate()} – ${end.getDate()} ${months[end.getMonth()]}`;
}

/** Строит картинку расписания (карточка) и возвращает PNG-блоб. null, если пар нет. */
async function buildScheduleImage(opts: {
  groupLabel: string;
  weekLabel: string;
  lessonsByDay: Record<string, Lesson[]>;
  dayLabels: Record<string, string>;
  subtitle?: ShareSubtitle;
}): Promise<Blob | null> {
  const days = Object.entries(opts.lessonsByDay);
  if (days.length === 0) return null;

  const BRAND = palette();

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "fixed",
    left: "-99999px",
    top: "0",
    width: "720px",
    padding: "28px",
    background: BRAND.bg,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: BRAND.fg,
    boxSizing: "border-box",
  });

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:20px;";
  header.innerHTML = `
    <img src="/logo.png" width="36" height="36" style="flex-shrink:0;" />
    <div>
      <div style="font-weight:700;font-size:16px;">${escapeHtml(opts.groupLabel)}</div>
      <div style="font-size:12px;color:${BRAND.muted};">${escapeHtml(opts.weekLabel)}</div>
    </div>
  `;
  wrap.appendChild(header);

  for (const [day, lessons] of days) {
    const dayBlock = document.createElement("div");
    dayBlock.style.marginBottom = "18px";

    const dayTitle = document.createElement("div");
    dayTitle.style.cssText = `font-weight:700;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.primary};margin-bottom:8px;`;
    dayTitle.textContent = opts.dayLabels[day] ?? day;
    dayBlock.appendChild(dayTitle);

    for (const l of lessons) {
      const kind = l.lesson_type ? (KIND_BY_TYPE[l.lesson_type] ?? "default") : "default";
      const kindColor = KIND_COLORS[kind];
      const accentColor = BRAND.dark ? kindColor.dark : kindColor.light;

      const row = document.createElement("div");
      row.style.cssText = `position:relative;overflow:hidden;display:flex;gap:12px;padding:12px 14px 12px 17px;margin-bottom:8px;border-radius:14px;background:${BRAND.card};border:1px solid ${BRAND.border};`;
      row.innerHTML = `<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${accentColor};"></span>`;

      const time = document.createElement("div");
      time.style.cssText = "width:46px;flex-shrink:0;line-height:1.2;";
      time.innerHTML = `
        <div style="font-size:15px;font-weight:800;color:${BRAND.fg};">${l.pair_time_start}</div>
        <div style="font-size:11px;font-weight:500;color:${BRAND.muted};margin-top:2px;">${l.pair_time_end}</div>
      `;

      const who = opts.subtitle === "group"
        ? (l.group ? `${shortGroupName(l.group.name)} · ${l.group.year} курс` : null)
        : l.teacher?.name;
      const meta = [l.room?.name ? `ауд. ${l.room.name}` : null, who].filter(Boolean).join(" · ");
      const typeLabel = l.lesson_type ? (TYPE_LABELS[l.lesson_type] ?? l.lesson_type) : null;

      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0;";
      info.innerHTML = `
        ${typeLabel ? `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:${BRAND.dark ? kindColor.bgDark : kindColor.bgLight};color:${accentColor};margin-bottom:5px;">${escapeHtml(typeLabel)}</span>` : ""}
        <div style="font-weight:700;font-size:14px;color:${BRAND.fg};">${escapeHtml(l.subject)}</div>
        ${meta ? `<div style="font-size:12px;color:${BRAND.muted};margin-top:2px;">${escapeHtml(meta)}</div>` : ""}
      `;

      row.appendChild(time);
      row.appendChild(info);
      dayBlock.appendChild(row);
    }
    wrap.appendChild(dayBlock);
  }

  const footer = document.createElement("div");
  footer.style.cssText = `margin-top:6px;font-size:11px;color:${BRAND.muted};text-align:center;`;
  footer.textContent = "МГУ Душанбе · Расписание занятий";
  wrap.appendChild(footer);

  document.body.appendChild(wrap);
  try {
    // Логотип — картинка, а не CSS-фон: без ожидания загрузки html2canvas
    // мог бы снять слепок раньше, чем она отрисуется, и получить пустое место.
    await Promise.all(
      Array.from(wrap.querySelectorAll("img")).map(img => img.decode().catch(() => {}))
    );
    const canvas = await html2canvas(wrap, { backgroundColor: BRAND.bg, scale: 2 });
    return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), "image/png"));
  } finally {
    document.body.removeChild(wrap);
  }
}

export type ShareImageResult = "shared" | "downloaded" | "empty" | "cancelled" | "error";

/** Строит картинку и делится ей (или скачивает, если Web Share недоступен). */
export async function shareScheduleImage(opts: {
  groupLabel: string;
  weekLabel: string;
  lessonsByDay: Record<string, Lesson[]>;
  dayLabels: Record<string, string>;
  subtitle?: ShareSubtitle;
}): Promise<ShareImageResult> {
  let blob: Blob | null;
  try {
    blob = await buildScheduleImage(opts);
  } catch {
    return "error";
  }
  if (!blob) return "empty";

  const file = new File([blob], "raspisanie.png", { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Расписание" });
      return "shared";
    }
  } catch (e) {
    // Пользователь закрыл системное меню шаринга — это не ошибка
    if (e instanceof Error && e.name === "AbortError") return "cancelled";
    return "error";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "raspisanie.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Освобождаем ссылку не сразу: часть браузеров отменяет скачивание, если
  // blob-URL отозвать в том же кадре, в котором по нему кликнули.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
