"use client";
/**
 * «Написать разработчику» (11 окт 2026): вопрос, ошибка или идея — прямо на сайте,
 * вместо ссылки на Telegram владельца (решение владельца: безопаснее для него и
 * анонимнее для студента). Галочка «Не показывать моё имя» — имя на сервере не
 * сохраняется вовсе. Ответ владелец пишет в панели /dev; он появляется здесь же и
 * приходит уведомлением (если уведомления на сайте включены).
 * Сервер — backend/app/services/dev_messages.py, клиент — lib/devMessages.ts.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import Icon from "@/components/tablo/Icon";
import {
  DevMessage, fmtMessageTime, loadMessages, markRepliesSeen, myDeviceId, parseServerTime, sendMessage,
} from "@/lib/devMessages";

const MAX = 2000;

export default function MessagesPage() {
  // null — ещё не знаем (до монтирования), "" — устройство не зарегистрировано
  const [device, setDevice] = useState<string | null>(null);
  const [list, setList] = useState<DevMessage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async (dev: string) => {
    try {
      const rows = await loadMessages(dev);
      setList(rows);
      setLoadError(false);
      if (rows.some(m => m.reply)) markRepliesSeen(dev);
    } catch {
      setLoadError(true);
      setList(l => l ?? []);
    }
  }, []);

  useEffect(() => {
    let dev = myDeviceId();
    try { if (!localStorage.getItem("selected_group_id")) dev = ""; } catch { /* приватный режим */ }
    setDevice(dev);
    if (dev) reload(dev);
  }, [reload]);

  // Пришёл push с ответом, пока страница открыта, — перечитать
  useEffect(() => {
    if (!device || !("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "push-received" && e.data?.kind === "dev-reply") reload(device);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [device, reload]);

  useEffect(() => {
    if (list?.length) endRef.current?.scrollIntoView({ block: "end" });
  }, [list?.length]);

  const submit = async () => {
    if (!device || busy || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const m = await sendMessage(device, text, anon);
      setList(l => [...(l ?? []), m]);
      setText("");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить");
    }
    setBusy(false);
  };

  return (
    <div className="t-page">
      <Header phone={false} />
      <main className="t-main t-av-main t-msg-main">
        <div className="t-av-top">
          <Link href="/profile" className="t-icon-btn" aria-label="Назад, в Кабинет">
            <Icon name="arrowLeft" size={24} />
          </Link>
          <h1>Написать разработчику</h1>
        </div>

        {device === "" && (
          <section className="t-pf-card t-msg-empty">
            <p>Чтобы написать, сначала выберите группу в Кабинете.</p>
            <Link href="/profile?edit=1" className="t-btn-fill t-msg-go">Выбрать группу</Link>
          </section>
        )}

        {device && (
          <>
            <p className="t-msg-lead">Вопрос, ошибка в расписании или идея. Ответ появится здесь же.</p>

            {list && list.length > 0 && (
              <div className="t-msg-thread" aria-label="Переписка">
                {list.map(m => (
                  <div key={m.id} className="t-msg-pair">
                    <div className="t-msg-bubble t-msg-mine">
                      <p>{m.text}</p>
                      <span>{m.anonymous ? "без имени · " : ""}{fmtMessageTime(parseServerTime(m.created_at))}</span>
                    </div>
                    {m.reply
                      ? <div className="t-msg-bubble t-msg-dev">
                          <b>Разработчик</b>
                          <p>{m.reply}</p>
                          <span>{fmtMessageTime(parseServerTime(m.replied_at))}</span>
                        </div>
                      : <div className="t-msg-wait">Ждёт ответа</div>}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            )}
            {loadError && <p className="t-msg-err">Не удалось загрузить переписку — проверьте интернет</p>}

            <section className="t-pf-card t-msg-form">
              <textarea
                value={text}
                onChange={e => { setText(e.target.value.slice(0, MAX)); setSent(false); setError(""); }}
                placeholder="Ваше сообщение"
                rows={4}
                maxLength={MAX}
                aria-label="Сообщение разработчику"
              />
              <label className="t-msg-anon">
                <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} />
                <span>Не показывать моё имя</span>
              </label>
              {anon && <p className="t-msg-note">Разработчик увидит только текст — без имени и группы.</p>}
              {error && <p className="t-msg-err">{error}</p>}
              {sent && !error && <p className="t-msg-ok">Отправлено</p>}
              <div className="t-msg-actions">
                {text.length > MAX - 200 && <em>{text.length} / {MAX}</em>}
                <button type="button" className="t-btn-fill" disabled={busy || !text.trim()} onClick={submit}>
                  {busy ? "Отправляем…" : "Отправить"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
