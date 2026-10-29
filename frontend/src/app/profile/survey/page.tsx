"use client";
/**
 * Опрос «Помогите улучшить» (CustDev; владелец, 29 окт 2026). Восемь вопросов, все необязательные, ответы
 * анонимные. Вопросы в духе «Mom Test»: про реальные случаи и проблемы из прошлого, а не «хотели бы вы»
 * (люди плохо предсказывают своё поведение, но хорошо помнят, что с ними было). Логика и тексты — lib/survey.ts.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Icon from "@/components/tablo/Icon";
import { myDeviceId } from "@/lib/devMessages";
import { EMPTY_SURVEY, FREQ, LEARN, RECOMMEND, sendSurvey, surveyFilled, type SurveyForm } from "@/lib/survey";

const MAX = 1500;
type OpenKey = "last_case" | "trouble" | "before_site" | "missing";

export default function SurveyPage() {
  const [device, setDevice] = useState<string | null>(null);
  const [f, setF] = useState<SurveyForm>(EMPTY_SURVEY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let dev = myDeviceId();
    try { if (!localStorage.getItem("selected_group_id")) dev = ""; } catch { /* приватный режим */ }
    setDevice(dev);
  }, []);

  const set = <K extends keyof SurveyForm>(k: K, v: SurveyForm[K]) => { setF(p => ({ ...p, [k]: v })); setError(""); };
  const toggleLearn = (code: string) => { setF(p => ({ ...p, learn: p.learn.includes(code) ? p.learn.filter(x => x !== code) : [...p.learn, code] })); setError(""); };

  const submit = async () => {
    if (!device || busy || !surveyFilled(f)) return;
    setBusy(true);
    try { await sendSurvey(device, f); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось отправить"); }
    setBusy(false);
  };

  const choice = (on: boolean) => `t-sv-opt ${on ? "t-sv-opt-on" : ""}`;
  const area = (key: OpenKey, placeholder: string) => (
    <textarea value={f[key]} rows={3} maxLength={MAX} placeholder={placeholder}
      onChange={e => set(key, e.target.value.slice(0, MAX))} />
  );

  return (
    <div className="t-page">
      <Header phone={false} />
      <main className="t-main t-av-main t-msg-main">
        <div className="t-av-top">
          <Link href="/profile" className="t-icon-btn" aria-label="Назад, в Кабинет"><Icon name="arrowLeft" size={24} /></Link>
          <h1>Помогите улучшить</h1>
        </div>

        {device === "" && (
          <section className="t-pf-card t-msg-empty">
            <p>Чтобы ответить, сначала выберите группу в Кабинете.</p>
            <Link href="/profile?edit=1" className="t-btn-fill t-msg-go">Выбрать группу</Link>
          </section>
        )}

        {device && done && (
          <section className="t-pf-card t-sv-thanks">
            <h2>Спасибо!</h2>
            <p>Ваши ответы помогут сделать сайт удобнее. Если появятся ещё идеи, напишите разработчику из Кабинета.</p>
            <Link href="/profile" className="t-btn-fill t-msg-go">В Кабинет</Link>
          </section>
        )}

        {device && !done && (
          <>
            <p className="t-msg-lead">
              Нам важно слышать каждого: расскажите, что вам удобно, а что нет, и чего вам не хватает.
              Лучше всего помогают реальные случаи: что было на самом деле. Ответы анонимные, на все вопросы
              отвечать не обязательно.
            </p>

            <section className="t-pf-card t-sv-q">
              <h2>1. Как часто вы открываете расписание?</h2>
              <div className="t-sv-opts">
                {FREQ.map(([code, label]) => (
                  <button key={code} type="button" className={choice(f.freq === code)} onClick={() => set("freq", f.freq === code ? null : code)}>{label}</button>
                ))}
              </div>
            </section>

            <section className="t-pf-card t-sv-q">
              <h2>2. Когда вы в последний раз открывали расписание, что хотели узнать?</h2>
              <p>Вспомните один конкретный случай.</p>
              {area("last_case", "Например: во сколько завтра первая пара")}
            </section>

            <section className="t-pf-card t-sv-q">
              <h2>3. Бывало, что вы пропустили пару или пришли не в ту аудиторию из-за расписания?</h2>
              <p>Если да, расскажите, что случилось.</p>
              {area("trouble", "Что именно произошло")}
            </section>

            <section className="t-pf-card t-sv-q">
              <h2>4. Как вы узнаёте об изменениях в расписании?</h2>
              <p>Можно выбрать несколько.</p>
              <div className="t-sv-opts">
                {LEARN.map(([code, label]) => (
                  <button key={code} type="button" className={choice(f.learn.includes(code))} onClick={() => toggleLearn(code)}>{label}</button>
                ))}
              </div>
            </section>

            <section className="t-pf-card t-sv-q">
              <h2>5. Чем вы пользовались до нашего сайта и что вас не устраивало?</h2>
              {area("before_site", "Например: фото в чате, сайт университета")}
            </section>

            <section className="t-pf-card t-sv-q">
              <h2>6. Что бы вы добавили или что вам мешает?</h2>
              {area("missing", "Любые идеи или что неудобно")}
            </section>

            <section className="t-pf-card t-sv-q">
              <h2>7. Насколько вам удобно пользоваться?</h2>
              <div className="t-sv-scale">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" className={choice(f.rating === n)} onClick={() => set("rating", f.rating === n ? null : n)}>{n}</button>
                ))}
              </div>
              <div className="t-sv-scale-lb"><span>Неудобно</span><span>Очень удобно</span></div>
            </section>

            <section className="t-pf-card t-sv-q">
              <h2>8. Порекомендуете сайт друзьям?</h2>
              <div className="t-sv-opts">
                {RECOMMEND.map(([code, label]) => (
                  <button key={code} type="button" className={choice(f.recommend === code)} onClick={() => set("recommend", f.recommend === code ? null : code)}>{label}</button>
                ))}
              </div>
            </section>

            {error && <p className="t-msg-err">{error}</p>}
            <div className="t-sv-send">
              <button type="button" className="t-btn-fill" disabled={busy || !surveyFilled(f)} onClick={submit}>
                {busy ? "Отправляем…" : "Отправить"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
