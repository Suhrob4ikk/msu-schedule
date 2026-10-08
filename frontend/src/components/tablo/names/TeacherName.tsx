"use client";
/**
 * Имя преподавателя с кнопкой «раскрыть»: «Джумаев Э.Х. ▾» → «Джумаев Эраж Хакназарович ▴».
 * Раскрывается каждый раз заново — ничего не запоминается (решение владельца).
 * Полного имени нет — просто текст, без кнопки.
 */
import { useState } from "react";
import type { FullNamesData } from "@/lib/api";
import { expandName, hasFullName } from "@/lib/fullNames";
import Icon from "../Icon";

export default function TeacherName({ name, data, size = 20 }: {
  name: string;
  data: FullNamesData | null;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!hasFullName(name, data)) return <>{name}</>;
  return (
    <>
      {open ? expandName(name, data) : name}
      <button
        type="button"
        className="t-fn-toggle"
        aria-expanded={open}
        aria-label={open ? "Свернуть имя" : "Раскрыть полное имя"}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
      >
        <Icon name="chevronDown" size={size} />
      </button>
    </>
  );
}
