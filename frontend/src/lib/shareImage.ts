import html2canvas from "html2canvas";
import { Lesson } from "./api";

// Фиксированные hex-цвета, а не CSS-переменные/Tailwind — html2canvas умеет
// не все современные цветовые функции (oklch из Tailwind 4), а тут нужен
// предсказуемый снимок независимо от темы страницы.
const BRAND = {
  bg: "#0b1220",
  card: "#121a2b",
  border: "#22304a",
  primary: "#0e9b72",
  fg: "#e7eaef",
  muted: "#8b94a3",
};

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** Строит картинку расписания (карточка) и возвращает PNG-блоб. null, если пар нет. */
async function buildScheduleImage(opts: {
  groupLabel: string;
  weekLabel: string;
  lessonsByDay: Record<string, Lesson[]>;
  dayLabels: Record<string, string>;
}): Promise<Blob | null> {
  const days = Object.entries(opts.lessonsByDay);
  if (days.length === 0) return null;

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
    <div style="width:36px;height:36px;border-radius:10px;background:${BRAND.primary};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;flex-shrink:0;">МГУ</div>
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
      const row = document.createElement("div");
      row.style.cssText = `display:flex;gap:12px;padding:10px 12px;margin-bottom:6px;border-radius:10px;background:${BRAND.card};border:1px solid ${BRAND.border};`;

      const time = document.createElement("div");
      time.style.cssText = `font-size:12px;font-weight:700;color:${BRAND.muted};width:44px;flex-shrink:0;line-height:1.5;`;
      time.innerHTML = `${l.pair_time_start}<br/>${l.pair_time_end}`;

      const meta = [l.lesson_type, l.room?.name ? `ауд. ${l.room.name}` : null, l.teacher?.name]
        .filter(Boolean).join(" · ");

      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0;";
      info.innerHTML = `
        <div style="font-weight:600;font-size:14px;">${escapeHtml(l.subject)}</div>
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
  URL.revokeObjectURL(url);
  return "downloaded";
}
