"use client";
/**
 * Напоминание «Помогите узнать полные имена 3 преподавателей вашей группы →» с крестиком.
 * Прячет его только крестик — до следующего понедельника; закрытая шторка не прячет
 * (просьба владельца 8 окт 2026). Нажатие открывает шторку со всеми, про кого можно
 * ответить. floating — закреплено над нижним меню на всех вкладках (GlobalNamesReminder).
 */
import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import type { FullNamesData } from "@/lib/api";
import { closeReminderThisWeek, reminderClosedThisWeek, shouldAsk } from "@/lib/fullNames";
import Icon from "../Icon";
import NamePoll from "./NamePoll";

export default function NamesReminder({ teachers, data, floating = false }: {
  teachers: string[];
  data: FullNamesData | null;
  floating?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [ask, setAsk] = useState<string[]>([]);

  useEffect(() => {
    setClosed(reminderClosedThisWeek());
    setReady(true);
  }, []);

  // Список фиксируем, пока открыта шторка — иначе ответивший тут же исчезал бы из неё
  useEffect(() => {
    if (!sheet) setAsk(teachers.filter(t => shouldAsk(t, data)));
  }, [teachers, data, sheet]);

  const visible = ready && !closed && !!data && ask.length > 0;
  // Плавающие кнопки страниц поднимаются над закреплённой строкой
  useEffect(() => {
    if (!floating) return;
    document.body.classList.toggle("fn-remind", visible);
    return () => document.body.classList.remove("fn-remind");
  }, [floating, visible]);

  if (!ready || closed || !data || (ask.length === 0 && !sheet)) return null;
  const n = ask.length;

  return (
    <>
      <div className={`t-fn-remind ${floating ? "t-fn-remind-float" : ""}`} hidden={ask.length === 0}>
        <button type="button" className="t-fn-remind-btn" onClick={() => setSheet(true)}>
          <Icon name="users" size={20} />
          <span>Помогите узнать полные имена {n} {n === 1 ? "преподавателя" : "преподавателей"} вашей группы</span>
          <Icon name="chevronRight" size={20} />
        </button>
        <button type="button" className="t-fn-x" aria-label="Скрыть до следующей недели"
          onClick={() => { closeReminderThisWeek(); setClosed(true); }}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {sheet && (
        <Sheet title="Полные имена преподавателей" subtitle="Ответьте, про кого знаете — остальных можно пропустить"
          onClose={() => setSheet(false)}>
          <div className="t-fn-list">
            {ask.length === 0 && <p className="t-fn-q">Готово — спасибо!</p>}
            {ask.map(t => (
              <NamePoll key={t} teacher={t} variants={data.variants[t] ?? []} closable={false} named startOpen={ask.length === 1}
                onSkip={() => setAsk(a => a.filter(x => x !== t))} />
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
