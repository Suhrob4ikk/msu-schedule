"use client";
/**
 * «Золотой профиль» в Кабинете для особых (lib/special.ts): карта вместо шапки профиля
 * (наклон телефона, секрет — звезда), из того же металла, что выбран во «Внешнем виде».
 * С 11 окт 2026 — серия и достижения (lib/vipProgress.ts): на карте огонёк серии и
 * «С нами N дней», нажатие переворачивает карту — на обороте прогресс; ниже календарь
 * посещений и медали, по нажатию на медаль — за что и когда получена или что сделать.
 * Письмо, торжественное открытие (10 окт), задания и кнопка отзыва (11 окт) убраны:
 * она всё увидела и отзыв оставила (решение владельца).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/tablo/Icon";
import { Sheet } from "@/components/tablo/Overlay";
import { useAppearance } from "@/lib/tablo/hooks";
import { dushanbeNow } from "@/lib/tablo/schedule";
import { isVipBirthday, metalOf, type MetalId, type VipInfo } from "@/lib/special";
import {
  STREAK_MARKS, buildMedals, nextStreakMark, computeStreak, fetchVipProgress, humanDate, medalWhen, todayIso,
  type Medal, type MedalIcon, type VipProgressState,
} from "@/lib/vipProgress";
import { Star, burstStars } from "./effects";
import VipFlame from "./VipFlame";

/** Бриллиант на карте того же металла — вместо звезды. */
function Gem() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor" opacity=".35" />
      <path d="M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 6 3-6M12 21 9 9M12 21l3-12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

const MI: Record<MedalIcon | "lock" | "trophy", React.ReactNode> = {
  flame: <path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-9z" fill="currentColor" />,
  cal: <g fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></g>,
  sun: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></g>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" />,
  gem: <path d="M6 3h12l4 6-10 12L2 9zM2 9h20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  map: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></g>,
  book: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></g>,
  key: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></g>,
  trophy: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8" /></g>,
  lock: <g fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></g>,
};
const MIcon = ({ name }: { name: MedalIcon | "lock" | "trophy" }) => <svg viewBox="0 0 24 24" aria-hidden="true">{MI[name]}</svg>;

/** Искры на бриллиантовой карте: места и ритм случайные, считаются один раз. */
function Sparks() {
  const list = useMemo(() => Array.from({ length: 7 }, () => {
    const size = 10 + Math.random() * 10;
    return { left: `${8 + Math.random() * 80}%`, top: `${10 + Math.random() * 70}%`, width: size, height: size,
      animationDelay: `${Math.random() * 2.4}s`, animationDuration: `${1.8 + Math.random() * 1.6}s` };
  }), []);
  return <>{list.map((st, i) => <span key={i} className="vip-spark" style={st} />)}</>;
}

interface Progress { streak: number; best: number; total: number; medals: Medal[] }

/** Карта: спереди «№ 001 · Шахзода · Подружка админа» и серия, сзади прогресс. Нажатие — переворот. */
function VipCard({ vip, metal, pg, bday }: { vip: VipInfo; metal: MetalId; pg: Progress | null; bday: boolean }) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [back, setBack] = useState(false);

  // Наклон: мышкой/пальцем по карте и наклоном телефона. Пока не трогают — карта
  // сама медленно покачивается (CSS-анимация vip-float).
  useEffect(() => {
    const el = tiltRef.current, w = wrap.current;
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
    e.stopPropagation(); // звезда — свой секрет, карту не переворачивает
    const w = wrap.current;
    if (w) {
      const r = e.currentTarget.getBoundingClientRect(), b = w.getBoundingClientRect();
      burstStars(w, r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, 16, 60);
    }
  };
  const got = pg ? pg.medals.filter(m => m.got).length : 0;

  return (
    <div className="vip-card-wrap" ref={wrap}>
      <div className="vip-tilt" ref={tiltRef}>
        <div className={`vip-flip ${back ? "vip-flipped" : ""}`} role="button" tabIndex={0}
          aria-label={back ? "Карта: оборот, нажмите, чтобы перевернуть" : "Карта, нажмите, чтобы перевернуть"}
          onClick={() => setBack(b => !b)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBack(b => !b); } }}>
          <div className={`vip-card vip-face vip-card-${metal} ${bday ? "vip-face-bday" : ""}`}>
            <div className="vip-card-dots" />
            {metal === "diamond" && <Sparks />}
            {bday && <span className="vip-card-ribbon">С ДНЁМ РОЖДЕНИЯ</span>}
            <div className="vip-card-in">
              <div className="vip-card-top">
                <span className="vip-card-brand">МГУ · РАСПИСАНИЕ</span>
                {pg ? (
                  <span className="vip-card-streak" title="Серия учебных дней"><VipFlame size={22} /><b>{pg.streak}</b></span>
                ) : <span className="vip-chip" />}
              </div>
              <div>
                <div className="vip-card-no">№ {vip.number}</div>
                <div className="vip-card-name vip-gold-text">{vip.name}</div>
                <div className="vip-card-role">{vip.role}</div>
                <div className="vip-card-since">{pg ? `С нами ${pg.total} ${dayWord(pg.total)}` : `С нами с ${vip.since}`}</div>
              </div>
            </div>
            <button type="button" className="vip-secret" aria-label={metal === "diamond" ? "Бриллиант" : "Звезда"} onClick={secret}>{metal === "diamond" ? <Gem /> : <Star />}</button>
          </div>
          <div className={`vip-card vip-face vip-face-back vip-card-${metal}`}>
            <div className="vip-card-dots" />
            <div className="vip-card-in vip-pg-back">
              <div className="vip-card-top"><span className="vip-card-brand">МОЙ ПРОГРЕСС</span><span className="vip-card-brand">№ {vip.number}</span></div>
              {pg && <RingBack pg={pg} run={back} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Число набегает с нуля, когда run становится true (карту перевернули). */
function CountUp({ to, run }: { to: number; run: boolean }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (!run) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setV(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run]);
  return <>{v}</>;
}

/** Оборот карты «Кольцо»: кольцо до следующей медали серии, в центре пламя и серия; справа рекорд и дни с нами. */
function RingBack({ pg, run }: { pg: Progress; run: boolean }) {
  const next = nextStreakMark(pg.streak);
  const C = 2 * Math.PI * 50;
  const frac = next ? pg.streak / next.n : 1;
  return (
    <div className="vip-ring-wrap">
      <div className="vip-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <linearGradient id="vipRingG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--gold-d)" /><stop offset=".5" stopColor="var(--gold-l)" /><stop offset="1" stopColor="var(--gold)" />
            </linearGradient>
          </defs>
          <circle className="vip-ring-trk" cx="60" cy="60" r="50" />
          <circle className="vip-ring-val" cx="60" cy="60" r="50" strokeDasharray={C} style={{ strokeDashoffset: run ? C * (1 - frac) : C }} />
        </svg>
        <div className="vip-ring-mid">
          <VipFlame size={20} embers={false} />
          <b><CountUp to={pg.streak} run={run} /></b>
          <small>{pg.streak === 1 ? "день" : dayWord(pg.streak)} подряд</small>
        </div>
      </div>
      <div className="vip-ring-side">
        <div className="vip-ring-stat"><i><MIcon name="trophy" /></i><div><b><CountUp to={pg.best} run={run} /></b><span>рекорд</span></div></div>
        <div className="vip-ring-stat"><i><MIcon name="cal" /></i><div><b><CountUp to={pg.total} run={run} /></b><span>{dayWord(pg.total)} с нами</span></div></div>
        <p className="vip-ring-next">{next ? <>До медали <em>«{next.name}»</em> — {next.n - pg.streak} {dayWord(next.n - pg.streak)}</> : "Все медали серии собраны"}</p>
      </div>
    </div>
  );
}

const dayWord = (n: number) => {
  const d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return "день";
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return "дня";
  return "дней";
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_IN = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** «Неделя крупно»: 6 кругов Пн–Сб — с пламенем, где заходила; рамка — спасён заморозкой.
 *  Стрелки листают прошлые недели. Ниже итоги и весь месяц точками. */
function WeekView({ st, today, frozen, info }: { st: VipProgressState; today: string; frozen: Set<string>; info: { streak: number; best: number } }) {
  const [shift, setShift] = useState(0); // 0 — эта неделя, -1 — прошлая…
  const visited = new Set(st.days), off = new Set(st.offdays);
  const start = st.first_day ?? st.days[0] ?? today;
  const t = new Date(today + "T00:00:00");
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7) + shift * 7);
  const days = WD.map((w, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return { w, iso: isoOf(d), n: d.getDate() }; });
  const seen = days.filter(d => visited.has(d.iso)).length;
  const study = days.filter(d => !off.has(d.iso) && d.iso <= today && d.iso >= start).length;
  const canBack = isoOf(mon) > start;
  const month = t.getMonth(), year = t.getFullYear();
  const len = new Date(year, month + 1, 0).getDate();
  const inMonth = st.days.filter(d => d.startsWith(`${year}-${pad(month + 1)}`)).length;
  return (
    <div className="vip-week-box">
      <div className="vip-week-h">
        <button type="button" aria-label="Прошлая неделя" disabled={!canBack} onClick={() => setShift(s => s - 1)}><Icon name="chevronLeft" size={18} /></button>
        <b>{shift === 0 ? "Эта неделя" : shift === -1 ? "Прошлая неделя" : `${days[0].n}–${days[5].n} ${MONTHS_IN[new Date(days[0].iso).getMonth()].replace(/е$/, "я")}`}</b>
        <button type="button" aria-label="Следующая неделя" disabled={shift >= 0} onClick={() => setShift(s => s + 1)}><Icon name="chevronRight" size={18} /></button>
        <span>{seen} из {study || 6}</span>
      </div>
      <div className="vip-week">
        {days.map(d => {
          const v = visited.has(d.iso), f = frozen.has(d.iso);
          const dim = !v && !f && (off.has(d.iso) || d.iso > today || d.iso < start);
          return (
            <div key={d.iso} className={`vip-wd ${v ? "vip-wd-v" : ""} ${f ? "vip-wd-f" : ""} ${dim ? "vip-wd-off" : ""} ${d.iso === today ? "vip-wd-today" : ""}`}>
              <small>{d.w}</small>
              <span className="vip-wd-o">{v ? <VipFlame size={20} embers={false} /> : f ? <i className="vip-wd-snow" /> : null}</span>
              <b>{d.n}</b>
            </div>
          );
        })}
      </div>
      <div className="vip-week-sum">
        <div><b>{info.streak}</b><span>серия</span></div>
        <div><b>{info.best}</b><span>рекорд</span></div>
        <div><b>{inMonth}</b><span>в {MONTHS_IN[month]}</span></div>
      </div>
      <div className="vip-month-dots" aria-label={`Посещения в ${MONTHS_IN[month]}`}>
        {Array.from({ length: len }, (_, i) => {
          const iso = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
          return <i key={iso} className={visited.has(iso) ? "vip-md-v" : iso > today ? "vip-md-fut" : ""} />;
        })}
      </div>
    </div>
  );
}

function MedalSheet({ m, onClose }: { m: Medal; onClose: () => void }) {
  const lock = !m.got;
  return (
    <Sheet onClose={onClose} label={m.name}>
      <div className="vip-md-sheet">
        <div className="vip-md-grp">{m.group.toUpperCase()}</div>
        <div className={`vip-md-big ${lock ? "vip-md-lock" : ""}`}>{m.group === "Секрет" && lock ? <b>?</b> : <MIcon name={lock ? "lock" : m.icon} />}</div>
        <h3>{m.name}</h3>
        {m.got ? (
          <>
            <p>{m.why}</p>
            <span className="vip-md-when"><MIcon name="cal" />Получено {medalWhen(m)}</span>
          </>
        ) : m.cond ? (
          <>
            <p>{m.cond}</p>
            {m.progress && (
              <>
                <div className="vip-md-bar"><i style={{ width: `${(m.progress[0] / m.progress[1]) * 100}%` }} /></div>
                <small>{m.progress[0]} из {m.progress[1]}</small>
              </>
            )}
          </>
        ) : <p>Условие секретное</p>}
      </div>
    </Sheet>
  );
}

/** Состояние серии: один запрос на страницу (карту и разделы ниже рисуют разные компоненты),
 *  дальше — обновления от VipTracker (событие vip-progress). */
let shared: VipProgressState | null = null;
let inflight: Promise<VipProgressState | null> | null = null;
function useVipProgress(vip: VipInfo) {
  const [st, setSt] = useState<VipProgressState | null>(shared);
  useEffect(() => {
    let device = "";
    try { device = localStorage.getItem("msu_device_id_v2") ?? ""; } catch { /* приватный режим */ }
    if (device) {
      inflight ??= fetchVipProgress(device, vip.id, true).finally(() => { setTimeout(() => { inflight = null; }, 0); });
      inflight.then(s => { if (s) { shared = s; setSt(s); } });
    }
    const onUpd = (e: Event) => { shared = (e as CustomEvent<VipProgressState>).detail; setSt(shared); };
    window.addEventListener("vip-progress", onUpd);
    return () => window.removeEventListener("vip-progress", onUpd);
  }, [vip.id]);
  const today = todayIso(dushanbeNow());
  const info = useMemo(() => (st ? computeStreak(st, today, STREAK_MARKS) : null), [st, today]);
  const medals = useMemo(() => (st && info ? buildMedals(st, info) : []), [st, info]);
  return { st, info, medals, today };
}

/** Карта и «Изменить имя или группу» — вместо шапки профиля. */
export default function VipProfile({ vip, onEdit }: { vip: VipInfo; onEdit: () => void }) {
  const metal = metalOf(useAppearance());
  const { info, medals } = useVipProgress(vip);
  const pg: Progress | null = info ? { streak: info.streak, best: info.best, total: info.total, medals } : null;
  return (
    <section className="vip-me">
      <VipCard vip={vip} metal={metal ?? "gold"} pg={pg} bday={isVipBirthday(vip, dushanbeNow())} />
      <button type="button" className="t-pf-link" onClick={onEdit}>
        Изменить имя или группу<Icon name="chevronRight" size={20} />
      </button>
    </section>
  );
}

/** Свёрнутый раздел: строка с итогом, по нажатию раскрывается (решение владельца — не занимать место). */
function Fold({ title, sum, children }: { title: string; sum: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`t-pf-card vip-fold ${open ? "vip-fold-open" : ""}`}>
      <button type="button" className="vip-fold-h" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <b>{title}</b><em>{sum}</em><Icon name="chevronDown" size={20} />
      </button>
      {open && <div className="vip-fold-b">{children}</div>}
    </section>
  );
}

/** «Посещения» и «Достижения» — в Кабинете под «Оформлением», свёрнутые. */
export function VipProgressSections({ vip }: { vip: VipInfo }) {
  const { st, info, medals, today } = useVipProgress(vip);
  const [open, setOpen] = useState<Medal | null>(null);
  const closeMedal = useCallback(() => setOpen(null), []);
  if (!st || !info) return null;
  const got = medals.filter(m => m.got).length;
  return (
    <>
      <h2 className="t-over t-pf-h">Прогресс</h2>
      <Fold title="Посещения" sum={`серия ${info.streak} · ${info.total} ${dayWord(info.total)} с нами`}>
        <WeekView st={st} today={today} frozen={info.frozen} info={info} />
      </Fold>
      <Fold title="Достижения" sum={`${got} из ${medals.length}`}>
        <div className="vip-meds">
          {medals.map(m => {
            const lock = !m.got;
            return (
              <button key={m.id} type="button" className={`vip-md ${lock ? "vip-md-lock" : ""}`} onClick={() => setOpen(m)}>
                <span className={`vip-md-c ${!lock && m.tier ? `vip-md-t${m.tier}` : ""}`}>
                  {m.group === "Секрет" && lock ? <b>?</b> : <MIcon name={lock ? "lock" : m.icon} />}
                  {lock && m.progress && m.progress[0] > 0 && <span className="vip-md-pr"><i style={{ width: `${(m.progress[0] / m.progress[1]) * 100}%` }} /></span>}
                </span>
                <span className="vip-md-n">{m.name}</span>
              </button>
            );
          })}
        </div>
        {st.first_day && <p className="vip-pg-note">Считаем с {humanDate(st.first_day)}</p>}
      </Fold>
      {open && <MedalSheet m={open} onClose={closeMedal} />}
    </>
  );
}
