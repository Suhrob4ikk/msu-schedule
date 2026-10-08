"use client";
/**
 * Опрос «Знаете полное имя преподавателя?» (lib/fullNames.ts).
 *
 * Не мешает: свёрнут в одну строку с крестиком, раскрывается по нажатию.
 * Крестик прячет на неделю. После ответа — голоса других (сервер отдаёт их
 * только ответившему). Своё имя проверяется по буквам инициалов сразу при вводе.
 */
import { useEffect, useState } from "react";
import { api, type NameResults } from "@/lib/api";
import {
  answerOf, hideFor, myDeviceId, proposalError, rememberAnswer, tidyName,
} from "@/lib/fullNames";
import Icon from "../Icon";

type Choice = { kind: "variant"; id: number } | { kind: "own" } | { kind: "dunno" } | null;

export default function NamePoll({ teacher, variants, startOpen = false, closable = true, named = false, onHide, onAnswered, onSkip }: {
  teacher: string;
  /** в списке нескольких преподавателей — имя прямо в строке */
  named?: boolean;
  variants: Array<{ id: number; name: string }>;
  startOpen?: boolean;
  closable?: boolean;
  onHide?: () => void;
  onAnswered?: () => void;
  /** кнопка «Не знаю» прямо в строке: ответ «не знаю» — и строку можно убрать */
  onSkip?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [answered, setAnswered] = useState<string | null>(null);
  const [res, setRes] = useState<NameResults | null>(null);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<Choice>(null);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setAnswered(answerOf(teacher)); }, [teacher]);

  // Уже отвечал и раскрыл — подтянуть голоса
  useEffect(() => {
    if (!open || !answered || res || editing) return;
    const dev = myDeviceId();
    if (!dev) return;
    api.nameResults(dev, teacher).then(r => {
      if (!r) return;
      if (!r.answered) { rememberAnswer(teacher, null); setAnswered(null); return; }
      setRes(r);
    }).catch(() => {});
  }, [open, answered, res, editing, teacher]);

  const ownErr = choice?.kind === "own" ? proposalError(teacher, own) : null;
  const canSend = !busy && !!choice && !(choice.kind === "own" && ownErr !== null);

  const send = async () => {
    const dev = myDeviceId();
    if (!dev || !choice) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.voteName({
        device_id: dev, teacher,
        ...(choice.kind === "variant" ? { variant_id: choice.id } : {}),
        ...(choice.kind === "dunno" ? { dunno: true } : {}),
        ...(choice.kind === "own" ? { proposal: tidyName(own) } : {}),
      });
      const a = r.dunno ? "dunno" : r.pending ? "pending" : "voted";
      rememberAnswer(teacher, a);
      setAnswered(a); setRes(r); setEditing(false); setChoice(null); setOwn("");
      onAnswered?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не получилось отправить ответ");
    }
    setBusy(false);
  };

  const skip = async () => {
    const dev = myDeviceId();
    if (!dev) return;
    setBusy(true);
    try {
      await api.voteName({ device_id: dev, teacher, dunno: true });
      rememberAnswer(teacher, "dunno");
      onSkip?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не получилось");
      setOpen(true);
    }
    setBusy(false);
  };

  const showForm = !answered || editing;
  const total = res ? res.variants.reduce((s, v) => s + (v.votes ?? 0), 0) : 0;

  return (
    <section className="t-fn-poll" data-open={open}>
      <div className="t-fn-head">
        <button type="button" className="t-fn-headbtn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <Icon name="user" size={20} />
          <span>
            {named && <b className="t-fn-who">{teacher}</b>}
            {answered && !editing
              ? (named ? "Вы ответили · что ответили другие" : "Вы ответили про полное имя · что ответили другие")
              : (named ? "Знаете полное имя?" : "Знаете полное имя преподавателя? Помогите другим")}
          </span>
          <Icon name={open ? "chevronUp" : "chevronDown"} size={20} />
        </button>
        {onSkip && !answered && (
          <button type="button" className="t-fn-skip" disabled={busy} onClick={skip}>Не знаю</button>
        )}
        {closable && !answered && (
          <button type="button" className="t-fn-x" aria-label="Не сейчас" onClick={() => { hideFor(teacher); onHide?.(); }}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      {open && showForm && (
        <div className="t-fn-body">
          <p className="t-fn-q">
            У вашей группы ведёт пары <b>{teacher}</b>. Полное имя преподавателя есть в журнале группы.
          </p>
          <div role="radiogroup" aria-label="Полное имя">
            {variants.map(v => (
              <label key={v.id} className="t-fn-opt" data-on={choice?.kind === "variant" && choice.id === v.id}>
                <input type="radio" name={`fn-${teacher}`} checked={choice?.kind === "variant" && choice.id === v.id}
                  onChange={() => setChoice({ kind: "variant", id: v.id })} />
                {v.name}
              </label>
            ))}
            <label className="t-fn-opt" data-on={choice?.kind === "own"}>
              <input type="radio" name={`fn-${teacher}`} checked={choice?.kind === "own"} onChange={() => setChoice({ kind: "own" })} />
              Предложить своё
            </label>
            {choice?.kind === "own" && (
              <div className="t-fn-own">
                <input
                  autoFocus value={own} onChange={e => setOwn(e.target.value)} maxLength={60}
                  placeholder="Имя Отчество" aria-invalid={!!ownErr}
                  className="t-fn-input" data-bad={!!ownErr}
                />
                <p className="t-fn-hint" data-tone={ownErr ? "bad" : own.trim() ? "ok" : undefined}>
                  {ownErr || (own.trim() ? "Подходит. Другие увидят вариант, когда его проверит администратор."
                    : `Имя и отчество — на «${teacher.replace(/^.*?\s+(?=[А-ЯЁ][а-яё]?\.)/, "")}»`)}
                </p>
              </div>
            )}
            <label className="t-fn-opt" data-on={choice?.kind === "dunno"}>
              <input type="radio" name={`fn-${teacher}`} checked={choice?.kind === "dunno"} onChange={() => setChoice({ kind: "dunno" })} />
              Не знаю
            </label>
          </div>
          {err && <p className="t-fn-hint" data-tone="bad">{err}</p>}
          <div className="t-fn-actions">
            <button type="button" className="t-fn-send" disabled={!canSend} onClick={send}>
              {busy ? "Отправляем…" : "Ответить"}
            </button>
            {editing && <button type="button" className="t-fn-link" onClick={() => setEditing(false)}>Отмена</button>}
          </div>
        </div>
      )}

      {open && !showForm && (
        <div className="t-fn-body">
          {answered === "dunno" ? (
            <p className="t-fn-note" data-tone="ok">Понятно, спасибо! Больше не будем спрашивать про этого преподавателя.</p>
          ) : res ? (
            <>
              {res.variants.length > 0 && (
                <p className="t-fn-q">Ответили {total} {plural(total, "человек", "человека", "человек")}. Имя появится у всех, когда его утвердит администратор.</p>
              )}
              {res.variants.map(v => {
                const pct = total ? Math.round(((v.votes ?? 0) / total) * 100) : 0;
                const mine = res.mine === v.id;
                return (
                  <div key={v.id} className="t-fn-res" data-mine={mine}>
                    <div className="t-fn-res-top">
                      <b>{v.name}{mine && <span className="t-fn-mine"> · ваш ответ</span>}</b>
                      <span>{v.votes ?? 0} · {pct}%</span>
                    </div>
                    <div className="t-fn-bar"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
              {res.pending && (
                <p className="t-fn-note" data-tone="wait">
                  Ваш вариант «{res.pending}» на проверке. Другие его пока не видят — появится у всех, когда его одобрит администратор.
                </p>
              )}
            </>
          ) : (
            <p className="t-fn-q">Загружаем…</p>
          )}
          <button type="button" className="t-fn-link" onClick={() => { setEditing(true); setRes(null); }}>Изменить ответ</button>
        </div>
      )}
    </section>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
