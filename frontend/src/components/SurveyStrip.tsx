"use client";
/**
 * Тонкая полоска «Помогите улучшить сайт» на главной (lib/survey.ts → surveyStripDue): появляется после трёх
 * разных дней захода, пока человек не ответил. Крестик убирает её насовсем и на несколько секунд подсказывает,
 * что опрос остался в Кабинете (владелец, 29 окт 2026). Нажатие — страница опроса.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/tablo/Icon";
import { surveyStripDue, surveyStripOff } from "@/lib/survey";

export default function SurveyStrip() {
  const [state, setState] = useState<"off" | "on" | "note">("off");
  useEffect(() => { setState(surveyStripDue() ? "on" : "off"); }, []);

  useEffect(() => {
    if (state !== "note") return;
    const t = window.setTimeout(() => setState("off"), 7000);
    return () => window.clearTimeout(t);
  }, [state]);

  if (state === "off") return null;
  if (state === "note") {
    return <div className="t-sv-strip t-sv-strip-note" role="status">Опрос останется в Кабинете, в разделе «Помогите улучшить».</div>;
  }
  return (
    <div className="t-sv-strip">
      <Link href="/profile/survey" className="t-sv-strip-main">
        <span className="t-sv-strip-ic"><Icon name="chat" size={20} /></span>
        <span className="t-sv-strip-tx">
          <b>Помогите улучшить сайт</b>
          <span>7 вопросов, 2 минуты, анонимно. Можно отказаться сейчас и пройти позже: Кабинет → «Помогите улучшить».</span>
        </span>
      </Link>
      <button type="button" className="t-sv-strip-x" aria-label="Скрыть"
        onClick={() => { surveyStripOff(); setState("note"); }}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
