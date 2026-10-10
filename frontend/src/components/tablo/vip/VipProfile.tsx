"use client";
/**
 * «Золотой профиль» в Кабинете для особых (lib/special.ts): карта вместо шапки
 * профиля (наклон телефона, секрет — звезда), задания и отзыв. Отзыв открывается,
 * когда всё посмотрено: секрет и золотая тема. Письмо «от администрации» и
 * торжественное открытие показывались один раз и убраны (решение владельца, 10 окт 2026).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/tablo/Icon";
import { Sheet } from "@/components/tablo/Overlay";
import { useAppearance } from "@/lib/tablo/hooks";
import { api } from "@/lib/api";
import { GOLD_ACCENT, VIP_TASKS_KEY, type VipInfo } from "@/lib/special";
import { Star, burstStars } from "./effects";

type Tasks = { secret?: boolean };

function readTasks(): Tasks {
  try { return JSON.parse(localStorage.getItem(VIP_TASKS_KEY) ?? "{}") ?? {}; } catch { return {}; }
}

/** Золотая карта: «№ 001 · Шахзода · Подружка админа». */
function VipCard({ vip, onSecret }: { vip: VipInfo; onSecret: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // Наклон: мышкой/пальцем по карте и наклоном телефона. Пока не трогают — карта
  // сама медленно покачивается (CSS-анимация vip-float).
  useEffect(() => {
    const el = card.current, w = wrap.current;
    if (!el || !w) return;
    const tilt = (px: number, py: number) => {
      el.classList.add("vip-held");
      el.style.transform = `rotateY(${(px - 0.5) * 22}deg) rotateX(${(0.5 - py) * 18}deg)`;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      el.style.setProperty("--sx", `${px * 100}%`);
    };
    const release = () => { el.classList.remove("vip-held"); el.style.transform = ""; };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tilt(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    };
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tilt(clamp(0.5 + e.gamma / 50), clamp(0.5 + (e.beta - 45) / 50));
    };
    w.addEventListener("pointermove", onMove);
    w.addEventListener("pointerleave", release);
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      w.removeEventListener("pointermove", onMove);
      w.removeEventListener("pointerleave", release);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);

  const secret = (e: React.MouseEvent<HTMLButtonElement>) => {
    const w = wrap.current;
    if (w) {
      const r = e.currentTarget.getBoundingClientRect(), b = w.getBoundingClientRect();
      burstStars(w, r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, 16, 60);
    }
    onSecret();
  };

  return (
    <div className="vip-card-wrap" ref={wrap}>
      <div className="vip-card" ref={card}>
        <div className="vip-card-dots" />
        <div className="vip-card-in">
          <div className="vip-card-top">
            <span className="vip-card-brand">МГУ · РАСПИСАНИЕ</span>
            <span className="vip-chip" />
          </div>
          <div>
            <div className="vip-card-no">№ {vip.number}</div>
            <div className="vip-card-name vip-gold-text">{vip.name}</div>
            <div className="vip-card-role">{vip.role}</div>
            <div className="vip-card-since">С нами с {vip.since}</div>
          </div>
        </div>
        <button type="button" className="vip-secret" aria-label="Звезда" onClick={secret}><Star /></button>
      </div>
    </div>
  );
}

/** Отзыв: оценка 1–5 звёздами и пара слов. Уходит владельцу письмом и в /dev. */
function ReviewSheet({ onClose }: { onClose: () => void }) {
  const [rate, setRate] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const thanks = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!done) return;
    if (thanks.current) burstStars(thanks.current, thanks.current.clientWidth / 2, 54, 18, 70);
    const id = window.setTimeout(onClose, 2400);
    return () => window.clearTimeout(id);
  }, [done, onClose]);

  const send = async () => {
    let deviceId = "";
    try { deviceId = localStorage.getItem("msu_device_id_v2") ?? ""; } catch { /* приватный режим */ }
    setBusy(true);
    setErr(null);
    try {
      await api.sendFeedback(deviceId, rate, text);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не получилось отправить");
    }
    setBusy(false);
  };

  return (
    <Sheet onClose={onClose} label="Отзыв о дизайне">
      <div className="vip-sheet">
        {done ? (
          <div className="vip-thanks" ref={thanks}>
            <div className="vip-bigstar"><Star /></div>
            <b>Отзыв отправлен</b>
            <span>Админ рассмотрит в порядке очереди</span>
          </div>
        ) : (
          <>
            <h3>Как вам новый дизайн?</h3>
            <p className="vip-sheet-q">Отзыв уйдёт лично админу</p>
            <div className="vip-stars" role="radiogroup" aria-label="Оценка">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" role="radio" aria-checked={rate === n} aria-label={`${n} из 5`}
                  className={n <= rate ? "vip-on" : ""} onClick={() => setRate(n)}>
                  <Star />
                </button>
              ))}
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Что понравилось, что поменять" />
            <button type="button" className="vip-gold-btn vip-send" disabled={!rate || busy} onClick={send}>
              {busy ? "Отправляем…" : "Отправить"}
            </button>
            {err && <p className="vip-err">{err}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}

export default function VipProfile({ vip, onEdit }: { vip: VipInfo; onEdit: () => void }) {
  const appearance = useAppearance();
  const [tasks, setTasks] = useState<Tasks>({});
  const [review, setReview] = useState(false);
  useEffect(() => { setTasks(readTasks()); }, []);

  const tick = useCallback((k: keyof Tasks) => {
    setTasks(t => {
      if (t[k]) return t;
      const next = { ...t, [k]: true };
      try { localStorage.setItem(VIP_TASKS_KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
      return next;
    });
  }, []);

  const gold = appearance?.accent.preset === "custom" && appearance.accent.custom?.toUpperCase() === GOLD_ACCENT;
  const seen = (tasks.secret ? 1 : 0) + (gold ? 1 : 0);

  return (
    <>
      <section className="vip-me">
        <VipCard vip={vip} onSecret={() => tick("secret")} />
        <button type="button" className="t-pf-link" onClick={onEdit}>
          Изменить имя или группу<Icon name="chevronRight" size={20} />
        </button>
      </section>

      <h2 className="t-over t-pf-h">Прежде чем оставить отзыв</h2>
      <section className="t-pf-card vip-tasks">
        <div className="vip-todo">
          <div className={tasks.secret ? "vip-ok" : ""}><i>{tasks.secret && <Icon name="check" size={14} strokeWidth={3} />}</i>Найти секрет на карте</div>
          <div className={gold ? "vip-ok" : ""}>
            <i>{gold && <Icon name="check" size={14} strokeWidth={3} />}</i>
            <Link href="/profile/appearance">Включить золотую тему</Link>
          </div>
        </div>
        <button type="button" className="vip-gold-btn vip-review-btn" disabled={seen < 2} onClick={() => setReview(true)}>
          {seen < 2 ? `Посмотрено ${seen} из 2` : "Оставить отзыв"}
        </button>
      </section>

      {review && <ReviewSheet onClose={() => setReview(false)} />}
    </>
  );
}
