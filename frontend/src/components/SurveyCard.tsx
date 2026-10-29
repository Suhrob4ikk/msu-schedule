"use client";
/** Карточка «Помогите улучшить сайт» в Кабинете (lib/survey.ts → surveyDue). Ответить — страница опроса, «Позже» — на неделю. */
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/tablo/Icon";
import { noteSurveyDay, surveyDue, surveyLater } from "@/lib/survey";

export default function SurveyCard() {
  const [show, setShow] = useState(false);
  useEffect(() => { noteSurveyDay(); setShow(surveyDue()); }, []);
  if (!show) return null;
  return (
    <section className="t-pf-card t-sv-card">
      <div className="t-sv-card-tx">
        <b>Помогите улучшить сайт</b>
        <span>7 коротких вопросов, 2 минуты. Анонимно.</span>
      </div>
      <div className="t-sv-card-btns">
        <button type="button" className="t-btn-ghost" onClick={() => { surveyLater(); setShow(false); }}>Позже</button>
        <Link href="/profile/survey" className="t-btn-fill t-sv-go"><Icon name="chat" size={18} />Ответить</Link>
      </div>
    </section>
  );
}
