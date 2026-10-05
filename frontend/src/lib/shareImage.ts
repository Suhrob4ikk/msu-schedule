import html2canvas from "html2canvas";
import { Lesson, shortGroupName } from "./api";
import { lessonKind } from "./tablo/schedule";

// Цвета — из токенов «Табло» на <html> (globals.css / lib/appearance.ts):
// картинка в той же теме и с тем же акцентом, что сайт. Все читаемые токены —
// обычные hex: html2canvas не умеет color-mix и oklch, поэтому --soft не берём.
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function palette() {
  return {
    bg: cssVar("--bg", "#F3F4F8"),
    card: cssVar("--surface", "#FFFFFF"),
    border: cssVar("--line", "#DEE3E9"),
    fg: cssVar("--text", "#121318"),
    muted: cssVar("--text-2", "#4E5160"),
    primary: cssVar("--ink", "#2F52C4"),
    font: typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "sans-serif",
  };
}

/** Бейдж типа: цвета те же, что у бейджей на странице. */
function kindColors(type: string | null): { label: string; bg: string; fg: string } | null {
  const k = lessonKind(type);
  if (!k) return null;
  const tone = k.palette === "lecture" ? "lec" : k.palette === "practice" ? "lab" : k.palette === "exam" ? "exam" : k.label === "Поток" ? "flow" : null;
  if (!tone) return { label: k.label, bg: cssVar("--chip", "#EDEEF3"), fg: cssVar("--text-2", "#4E5160") };
  return { label: k.label, bg: cssVar(`--${tone}-bg`, "#EDEEF3"), fg: cssVar(`--${tone}-text`, "#4E5160") };
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
    fontFamily: BRAND.font,
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
      const kind = kindColors(l.lesson_type);

      const row = document.createElement("div");
      row.style.cssText = `display:flex;gap:12px;align-items:flex-start;padding:12px 14px;margin-bottom:8px;border-radius:18px;background:${BRAND.card};border:1px solid ${BRAND.border};`;

      const time = document.createElement("div");
      time.style.cssText = "width:52px;flex-shrink:0;line-height:1.2;";
      time.innerHTML = `
        <div style="font-size:16px;font-weight:700;color:${BRAND.fg};">${l.pair_time_start}</div>
        <div style="font-size:12px;font-weight:500;color:${BRAND.muted};margin-top:2px;">${l.pair_time_end}</div>
      `;

      const who = opts.subtitle === "group"
        ? (l.group ? `${shortGroupName(l.group.name)} · ${l.group.year} курс` : null)
        : l.teacher?.name;

      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0;";
      info.innerHTML = `
        <div style="font-weight:600;font-size:15px;color:${BRAND.fg};">${escapeHtml(l.subject)}</div>
        <div style="margin-top:4px;font-size:12px;color:${BRAND.muted};">
          ${kind ? `<span style="display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:${kind.bg};color:${kind.fg};margin-right:6px;">${escapeHtml(kind.label)}</span>` : ""}${who ? escapeHtml(who) : ""}
        </div>
      `;

      const room = document.createElement("div");
      room.style.cssText = `flex-shrink:0;font-size:20px;font-weight:800;color:${BRAND.fg};`;
      room.textContent = l.room?.name ?? "—";

      row.appendChild(time);
      row.appendChild(info);
      row.appendChild(room);
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
