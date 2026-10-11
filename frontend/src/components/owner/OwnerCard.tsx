"use client";
/**
 * Профиль владельца в Кабинете (выбор владельца из демо, 11 окт 2026).
 * OwnerCard — карта «№ 000 · Админ»: фрактал Мандельброта, который **растёт с уровнем**
 * (на 1-м — всё множество целиком, на каждом следующем — глубже, к «долине морских коньков»),
 * имя, кольцо уровня. Нажатие переворачивает: на обороте серия и ряд Фибоначчи.
 * OwnerSections — семестр, моя неделя, ближайший зачёт и теоремы (lib/ownerProgress.ts).
 * Теоремы — в свёрнутом разделе (как «Достижения» у «золотого профиля»): строка «Теоремы ·
 * доказано N из 10», по нажатию сетка плиток. Нажатие на плитку — поверх сетки из неё
 * вырастает карточка (соседи остаются на месте, вокруг затемнение): формулировка, сколько
 * уже сделано, у доказанной — дата и штамп ∎. Владелец: «поверх других, а не раздвигать».
 */
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/tablo/Icon";
import { api, type Lesson } from "@/lib/api";
import { dushanbeNow } from "@/lib/tablo/schedule";
import { todayIso } from "@/lib/vipProgress";
import { FIB, isExam, nextFib, termOf, theoremWhen, weekStats, type Theorem } from "@/lib/ownerProgress";
import { useOwnerProgress } from "./OwnerTracker";

// Палитра — только цвета оформления, по кругу
const STOPS = [[11, 15, 46], [58, 75, 255], [127, 224, 255], [235, 248, 255], [138, 92, 255], [40, 20, 110], [11, 15, 46]];
function color(v: number): number[] {
  const t = (v * 0.03) % 1, f = t * (STOPS.length - 1), i = Math.floor(f), k = f - i, A = STOPS[i], B = STOPS[i + 1];
  return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k];
}

/** Фрактал для уровня L: с каждым уровнем ближе к точке у «долины морских коньков». */
function drawLevel(c: HTMLCanvasElement, L: number) {
  const res = Math.min(2, window.devicePixelRatio || 1);
  const w = (c.width = Math.round(c.clientWidth * res)), h = (c.height = Math.round(c.clientHeight * res));
  const ctx = c.getContext("2d");
  if (!ctx || !w || !h) return;
  // 1-й уровень — всё множество; дальше камера сразу смотрит на «долину морских коньков»
  // (раньше летела к ней по прямой через пустую область — на 3–4 уровне был скучный «конус»)
  const tx = -0.743643887, ty = 0.131825904;
  const cx0 = L === 1 ? -0.6 : tx, cy0 = L === 1 ? 0 : ty;
  // шкала подобрана сравнением всех 10 уровней: со 2-го в кадре уже узоры, а не тёмная «перемычка»
  const span = L === 1 ? 3.4 : 0.1 * Math.pow(0.62, L - 2), maxI = Math.round(80 + 45 * L), sc = span / w;
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x0 = cx0 + (px - w * 0.62) * sc, y0 = cy0 + (py - h / 2) * sc;
      let x = 0, y = 0, i = 0;
      while (x * x + y * y < 4 && i < maxI) { const t = x * x - y * y + x0; y = 2 * x * y + y0; x = t; i++; }
      const p = (py * w + px) * 4;
      if (i === maxI) { img.data[p] = 6; img.data[p + 1] = 8; img.data[p + 2] = 26; }
      else { const [r, g, b] = color(i + 1 - Math.log2(Math.log2(x * x + y * y) / 2)); img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; }
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

export function OwnerCard({ name, onEdit }: { name: string; onEdit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);
  const pg = useOwnerProgress();
  const level = pg?.level.level ?? 0;

  useEffect(() => {
    const c = canvas.current;
    if (c && level) requestAnimationFrame(() => drawLevel(c, level));
  }, [level]);

  useEffect(() => {
    const el = tilt.current;
    if (!el) return;
    const set = (px: number, py: number) => { el.style.transform = `perspective(900px) rotateY(${(px - 0.5) * 14}deg) rotateX(${(0.5 - py) * 10}deg)`; };
    const onMove = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; const r = el.getBoundingClientRect(); set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
    const reset = () => { el.style.transform = ""; };
    const onOri = (e: DeviceOrientationEvent) => { if (e.gamma != null && e.beta != null) set(Math.min(1, Math.max(0, 0.5 + e.gamma / 50)), Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 50))); };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    window.addEventListener("deviceorientation", onOri);
    return () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", reset); window.removeEventListener("deviceorientation", onOri); };
  }, []);

  const lv = pg?.level;
  const nf = pg ? nextFib(pg.streak) : null;
  const toggle = () => setFlip(f => !f);

  return (
    <section className="ow-me">
      <div className="ow-tilt" ref={tilt}>
        <div className={`ow-flip ${flip ? "ow-flip-on" : ""}`} role="button" tabIndex={0} aria-pressed={flip}
          aria-label="Карта — нажмите, чтобы перевернуть"
          onClick={toggle} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
          <div className="ow-card ow-front">
            <canvas ref={canvas} aria-hidden="true" />
            <span className="ow-card-shade" /><span className="ow-card-holo" />
            <div className="ow-card-top"><span>МГУ · РАСПИСАНИЕ</span><span>№ 000</span></div>
            <div>
              <div className="ow-card-name">{name}</div>
              {lv && (
                <div className="ow-lvl">
                  <svg className="ow-lvl-ring" viewBox="0 0 40 40" aria-hidden="true">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="4" />
                    <circle cx="20" cy="20" r="16" fill="none" stroke="#7fe0ff" strokeWidth="4" strokeLinecap="round" transform="rotate(-90 20 20)"
                      strokeDasharray="100.5" strokeDashoffset={(100.5 * (1 - lv.share)).toFixed(1)} />
                    <text x="20" y="25" textAnchor="middle">{lv.level}</text>
                  </svg>
                  <div>
                    <b>Уровень {lv.level} · {lv.name}</b>
                    <small>{lv.next ? `ещё ${lv.toNext} ${plural(lv.toNext, "очко", "очка", "очков")} до «${lv.next}»` : "высший уровень"}</small>
                  </div>
                </div>
              )}
            </div>
            <span className="ow-turn" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>
            </span>
          </div>
          <div className="ow-card ow-back">
            {!pg ? <p className="ow-back-wait">Загружается…</p> : (
              <>
                <div className="ow-back-top">
                  <div className="ow-back-big">{pg.streak}<small>{plural(pg.streak, "ДЕНЬ", "ДНЯ", "ДНЕЙ")} ПОДРЯД</small></div>
                  {nf && <div className="ow-back-next">до {nf} — {nf - pg.streak} {plural(nf - pg.streak, "день", "дня", "дней")}<small>число Фибоначчи</small></div>}
                </div>
                <div className="ow-fib">
                  {FIB.map(n => <span key={n} className={n <= pg.streak ? "ow-fib-on" : n === nf ? "ow-fib-next" : ""}>{n}</span>)}
                </div>
                <div className="ow-back-row">
                  <span>Рекорд <b>{pg.best}</b></span>
                  <span>С нами <b>{pg.total} {plural(pg.total, "день", "дня", "дней")}</b></span>
                  <span>Заморозка <b>{pg.frozenThisWeek ? "потрачена" : "есть"}</b></span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="t-pf-card">
        <button type="button" className="t-pf-link" onClick={onEdit}>Изменить имя или группу<Icon name="chevronRight" size={20} /></button>
      </div>
    </section>
  );
}

/** Семестр, моя неделя, ближайший зачёт, теоремы. */
export function OwnerSections({ groupId }: { groupId: number | null }) {
  const pg = useOwnerProgress();
  const [now, setNow] = useState<Date | null>(null);
  const [week, setWeek] = useState<Lesson[] | null>(null);
  const [exam, setExam] = useState<{ l: Lesson; days: number } | null>(null);
  const [foldOpen, setFoldOpen] = useState(false);

  useEffect(() => { setNow(dushanbeNow()); }, []);

  // эта неделя (по дате Душанбе) и следующая — для «моей недели» и ближайшего зачёта
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    (async () => {
      try {
        const today = todayIso(dushanbeNow());
        const weeks = (await api.getGroupWeeks(groupId)).filter(w => w.is_latest).sort((a, b) => a.week_start.localeCompare(b.week_start));
        let curIdx = -1;
        weeks.forEach((w, i) => { if (w.week_start <= today) curIdx = i; });
        // в воскресенье полезнее наступающая неделя
        if (dushanbeNow().getDay() === 0 && weeks[curIdx + 1]) curIdx += 1;
        const cur = curIdx >= 0 ? weeks[curIdx] : null;
        const next = weeks[curIdx + 1] ?? null;
        const curL = cur ? await api.getGroupSchedule(groupId, undefined, cur.id) : [];
        const nextL = next ? await api.getGroupSchedule(groupId, undefined, next.id) : [];
        if (!alive) return;
        setWeek(curL);
        const d = dushanbeNow();
        const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const up = [...curL, ...nextL]
          .filter(l => isExam(l) && l.lesson_date && (l.lesson_date > today || (l.lesson_date === today && l.pair_time_end > hhmm)))
          .sort((a, b) => `${a.lesson_date}${a.pair_time_start}`.localeCompare(`${b.lesson_date}${b.pair_time_start}`))[0];
        setExam(up ? { l: up, days: Math.round((new Date(up.lesson_date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000) } : null);
      } catch { /* без сети — блоки не показываем */ }
    })();
    return () => { alive = false; };
  }, [groupId]);

  const term = now ? termOf(now) : null;
  const ws = week ? weekStats(week) : null;
  const hours = ws ? (Number.isInteger(ws.hours) ? `${ws.hours}` : ws.hours.toFixed(1).replace(".", ",")) : "";

  return (
    <>
      <h2 className="t-over t-pf-h">Семестр</h2>
      {term ? (
        <div className="ow-glass ow-sem">
          <div className="ow-sem-top"><b>{Math.round(term.share * 100)}%</b><span>{term.week}-я неделя из {term.weeks}</span></div>
          <div className="ow-bar"><i style={{ width: `${Math.min(100, term.share * 100)}%` }} /></div>
          <div className="ow-sem-sub"><span>{term.startLabel}</span><span>до сессии {term.weeksLeft} {plural(term.weeksLeft, "неделя", "недели", "недель")}</span></div>
        </div>
      ) : now && <div className="ow-glass ow-sem"><div className="ow-sem-top"><b>Сессия или каникулы</b></div></div>}
      {ws && ws.pairs > 0 && (
        <div className="ow-wk">
          <div className="ow-glass"><b>{ws.pairs}</b><span>{plural(ws.pairs, "пара", "пары", "пар")} на неделе</span></div>
          <div className="ow-glass"><b>{hours} ч</b><span>учёбы</span></div>
          <div className="ow-glass"><b>{ws.windows}</b><span>{plural(ws.windows, "окно", "окна", "окон")}</span></div>
        </div>
      )}
      {exam && (
        <div className="ow-glass ow-exam">
          <div className="ow-exam-n">{exam.days === 0 ? "сег." : exam.days}{exam.days > 0 && <small>{plural(exam.days, "ДЕНЬ", "ДНЯ", "ДНЕЙ")}</small>}</div>
          <div>
            <b>{exam.l.lesson_type ? `${exam.l.lesson_type[0].toUpperCase()}${exam.l.lesson_type.slice(1)} · ` : ""}{exam.l.subject}</b>
            <span>{new Date(exam.l.lesson_date + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })} · {exam.l.pair_time_start}{exam.l.room ? ` · ауд. ${exam.l.room.name}` : ""}</span>
          </div>
        </div>
      )}

      {pg && (
        <section className={`t-pf-card ow-fold ${foldOpen ? "ow-fold-open" : ""}`}>
          <button type="button" className="ow-fold-h" aria-expanded={foldOpen} onClick={() => setFoldOpen(o => !o)}>
            <span className="ow-fold-ic" aria-hidden="true" />
            <b>Теоремы</b>
            <em>доказано {pg.proved} из {pg.theorems.length}</em>
            <Icon name="chevronDown" size={20} />
          </button>
          {foldOpen && <TheoremGrid theorems={pg.theorems} />}
        </section>
      )}
    </>
  );
}

const pct = (cur: number, goal: number) => `${Math.min(100, (cur / Math.max(goal, 1)) * 100)}%`;

interface Anchor { t: Theorem; top: number; height: number; cx: number }

/** Сетка плиток и карточка, всплывающая поверх неё из нажатой плитки. */
function TheoremGrid({ theorems }: { theorems: Theorem[] }) {
  const [open, setOpen] = useState<Anchor | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const close = () => setOpen(null);

  // карточка целиком на экране; Escape закрывает
  useEffect(() => {
    if (!open) return;
    pop.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const show = (t: Theorem, el: HTMLElement) => setOpen({ t, top: el.offsetTop, height: el.offsetHeight, cx: el.offsetLeft + el.offsetWidth / 2 });
  const t = open?.t;
  const p = t && !t.got ? t.progress : undefined;

  return (
    <div className="ow-thm">
      {theorems.map(th => {
        const tp = th.got ? undefined : th.progress;
        return (
          <button key={th.id} type="button" onClick={e => show(th, e.currentTarget)}
            className={`ow-glass ow-th ${th.got ? "ow-th-ok" : ""} ${th.secret && !th.got ? "ow-th-sec" : ""}`}>
            {th.got && <span className="ow-qed" aria-hidden="true" />}
            <span className="ow-th-k">{th.got ? "Доказано" : th.secret ? "Секрет" : "Не доказано"}</span>
            <b>{th.name}</b>
            <small>{th.got ? theoremWhen(th) : tp ? `${tp.cur} из ${tp.goal}` : th.short}</small>
            {tp && <span className="ow-th-mini" aria-hidden="true"><i style={{ width: pct(tp.cur, tp.goal) }} /></span>}
          </button>
        );
      })}
      {open && t && (
        <>
          <div className="ow-th-scrim" onClick={close} aria-hidden="true" />
          <div ref={pop} role="dialog" aria-label={t.name} onClick={close}
            className={`ow-th-pop ${t.got ? "ow-th-pop-ok" : ""}`}
            style={{ top: open.top - 8, minHeight: open.height + 16, transformOrigin: `${open.cx}px ${open.height / 2 + 8}px` }}>
            <span className="ow-th-k">{t.got ? "Доказано" : t.secret ? "Секретная теорема" : "Ещё не доказано"}</span>
            <b className="ow-th-pop-name">{t.name}</b>
            <span className="ow-th-st">
              {t.statement ? <><i>Формулировка.</i> {t.statement}</> : "Условие не раскрывается. Доказательство найдётся само — может быть, случайно."}
            </span>
            {t.got && <span className="ow-th-when"><span className="ow-qed ow-qed-stamp" aria-hidden="true" />Доказано {theoremWhen(t)}</span>}
            {p && (
              <span className="ow-th-prog">
                <span className="ow-th-num"><b>{p.cur}</b> из {p.goal} <em>{p.unit}</em></span>
                <span className="ow-bar ow-bar-fill"><i style={{ width: pct(p.cur, p.goal) }} /></span>
                {p.note && <small>{p.note}</small>}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
