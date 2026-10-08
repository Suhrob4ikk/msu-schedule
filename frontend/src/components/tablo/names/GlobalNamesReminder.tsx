"use client";
/**
 * Напоминание «Помогите узнать полные имена…» на всех вкладках (просьба владельца
 * 8 окт 2026): закреплено над нижним меню и не уезжает при прокрутке. Кого спрашивать —
 * преподаватели своей группы на этой неделе; расписание берём из кэша api.ts.
 * Пока строка видна, на <body> висит класс fn-remind — плавающие кнопки
 * («К сегодня», «К моей группе») поднимаются над ней (tablo-names.css).
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { myDeviceId, myGroupId, personsOf, useFullNames } from "@/lib/fullNames";
import { dushanbeNow, isoOf } from "@/lib/tablo/schedule";
import { mondayOf } from "@/lib/tablo/teachers";
import NamesReminder from "./NamesReminder";

export default function GlobalNamesReminder() {
  const pathname = usePathname();
  const data = useFullNames();
  const [teachers, setTeachers] = useState<string[]>([]);

  useEffect(() => {
    const group = myGroupId();
    if (!group || !myDeviceId()) return;
    let alive = true;
    const monday = mondayOf(isoOf(dushanbeNow()));
    api.getGroupWeeks(group)
      .then(ws => {
        const w = ws.find(x => x.week_start === monday);
        return w ? api.getGroupSchedule(group, undefined, w.id) : [];
      })
      .then(ls => {
        if (alive) setTeachers([...new Set(ls.flatMap(l => personsOf(l.teacher?.name)))].sort((a, b) => a.localeCompare(b, "ru")));
      })
      .catch(() => { /* нет сети — без напоминания */ });
    return () => { alive = false; };
  }, [pathname]);

  if (pathname?.startsWith("/dev") || teachers.length === 0) return null;
  return <NamesReminder teachers={teachers} data={data} floating />;
}
