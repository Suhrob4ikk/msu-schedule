"use client";
/**
 * Верх «Расписания» у владельца (привязанные в /dev устройства; 11 окт 2026):
 * - приветствие и аватар «φ» — нажатие выстраивает звёзды в золотую спираль (угол 137,5°);
 * - пульт: пользователи, новые за сегодня, последняя проверка msu.tj (/user/owner-pulse),
 *   под ним бежит синусоида; нажатие раскрывает быстрые действия;
 * - поиск по всему: группа, педагог, аудитория — сразу открывает нужное.
 * Быстрые действия ходят в панель тем же токеном, что /dev (sessionStorage, 24 ч);
 * нет токена — открываем /dev, там пароль.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, shortGroupName, type Group } from "@/lib/api";
import { dushanbeNow } from "@/lib/tablo/schedule";

const API = process.env.NEXT_PUBLIC_API_URL!;
const DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

interface Pulse { users: number; today: number; app: number; last_sync: { at: string | null; status: string | null } }
interface Hit { kind: "ГРУППА" | "ПЕДАГОГ" | "АУД."; title: string; sub: string; href: string; hay: string }

function devToken(): string | null {
  try {
    const s = JSON.parse(sessionStorage.getItem("dev_panel_token") ?? "null") as { token: string; exp: number } | null;
    return s && s.exp > Date.now() ? s.token : null;
  } catch { return null; }
}
const timeHM = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return d.toLocaleTimeString("ru-RU", { timeZone: "Asia/Dushanbe", hour: "2-digit", minute: "2-digit" });
};
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Золотая спираль из звёзд от аватара (подсолнух: угол Фибоначчи 137,5°). */
function GoldenSpiral({ from, onDone }: { from: DOMRect; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const cx = window.innerWidth / 2, cy = window.innerHeight * 0.42;
    const ga = Math.PI * (3 - Math.sqrt(5));
    const sx = from.left + from.width / 2, sy = from.top + from.height / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (let i = 0; i < 150; i++) {
      const s = document.createElement("span");
      s.className = "ow-spiral";
      b.appendChild(s);
      const r = 7.5 * Math.sqrt(i), th = i * ga, x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
      s.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(.2)`, opacity: 0 },
        { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${x}px, ${y}px) scale(.3)`, opacity: 0 },
      ], { duration: reduce ? 1 : 3200, delay: reduce ? 0 : i * 8, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" });
    }
    const t = window.setTimeout(onDone, reduce ? 50 : 4500);
    return () => window.clearTimeout(t);
  }, [from, onDone]);
  return createPortal(<div ref={box} className="ow-spiral-box" aria-hidden="true" />, document.body);
}

export default function OwnerHome({ name, now }: { name: string; now: Date }) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pool, setPool] = useState<Hit[] | null>(null);
  const [spiral, setSpiral] = useState<DOMRect | null>(null);
  const spiralDone = useCallback(() => setSpiral(null), []);
  const wave = useRef<SVGPathElement>(null);
  const h = now.getHours();
  const hello = h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";

  useEffect(() => {
    let device = "";
    try { device = localStorage.getItem("msu_device_id_v2") ?? ""; } catch { return; }
    if (!device) return;
    fetch(`${API}/user/owner-pulse?device_id=${encodeURIComponent(device)}`).then(r => (r.ok ? r.json() : null)).then(setPulse).catch(() => {});
  }, []);

  // синусоида под пультом
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, t = 0;
    const tick = () => {
      t += 0.05;
      let d = "";
      for (let x = 0; x <= 300; x += 6) {
        const y = 20 + Math.sin(x / 22 + t) * 7 * Math.sin(x / 140 + t / 3);
        d += `${x ? "L" : "M"}${x} ${y.toFixed(1)}`;
      }
      wave.current?.setAttribute("d", d);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  // данные для поиска — по первому фокусу
  const loadPool = async () => {
    if (pool) return;
    const out: Hit[] = [];
    try {
      const gs: Group[] = await api.getGroups();
      for (const g of gs) {
        const short = shortGroupName(g.name);
        out.push({ kind: "ГРУППА", title: `${short} · ${g.year} курс`, sub: g.name.charAt(0) + g.name.slice(1).toLowerCase(), href: `/?group=${g.id}`, hay: norm(`${short} ${g.year} ${g.name}`) });
      }
    } catch { /* без групп */ }
    try {
      const ts = await api.getTeachers();
      for (const t of ts) out.push({ kind: "ПЕДАГОГ", title: t.name, sub: "Расписание педагога", href: `/teachers?teacher=${t.id}`, hay: norm(t.name) });
    } catch { /* без педагогов */ }
    try {
      const d = dushanbeNow();
      const rooms = await api.getFreeRooms(DAYS[d.getDay() === 0 ? 1 : d.getDay()], "I");
      const names = new Set<string>();
      for (const r of rooms) if (r.room_name) names.add(r.room_name);
      for (const n of names) out.push({ kind: "АУД.", title: `Аудитория ${n}`, sub: "Занятость по парам", href: `/rooms?room=${encodeURIComponent(n)}`, hay: norm(`ауд аудитория ${n}`) });
    } catch { /* без аудиторий */ }
    setPool(out);
  };
  const hits = useMemo(() => {
    const words = norm(q).trim().split(/\s+/).filter(Boolean);
    if (!words.length || !pool) return [];
    return pool.filter(p => words.every(w => p.hay.includes(w))).slice(0, 6);
  }, [q, pool]);

  const action = async (id: "sync" | "push" | "names" | "panel") => {
    if (id === "names" || id === "panel") { window.location.href = "/dev"; return; }
    const tok = devToken();
    if (!tok) { setToast("Сначала войдите в панель — пароль спросят раз в сутки"); window.setTimeout(() => { window.location.href = "/dev"; }, 900); return; }
    setBusy(id);
    try {
      const res = await fetch(`${API}/dev/${id === "sync" ? "sync" : "test-push"}`, { method: "POST", headers: { "X-Dev-Token": tok, "Content-Type": "application/json" } });
      if (res.status === 404) { setToast("Вход в панель истёк — войдите заново"); window.setTimeout(() => { window.location.href = "/dev"; }, 900); return; }
      const j = await res.json().catch(() => null);
      if (id === "sync") {
        const r = (j?.results ?? []) as Array<{ faculty: string; status: string; changes?: number }>;
        setToast(r.length ? r.map(x => `${x.faculty}: ${x.status === "success" ? `обновлено${x.changes ? `, изменений ${x.changes}` : ""}` : x.status === "no_change" ? "без изменений" : "ошибка"}`).join(" · ") : "msu.tj проверен");
      } else {
        setToast("Тестовый push отправлен на ваши устройства");
      }
    } catch {
      setToast("Нет связи с сервером");
    } finally {
      setBusy(null);
    }
  };

  const syncOk = pulse?.last_sync.status !== "error";

  return (
    <div className="ow-home">
      <div className="ow-top">
        <div className="ow-hello">{hello},<br /><span>{name}</span></div>
        <button type="button" className="ow-phi" aria-label="Золотое сечение" onClick={e => setSpiral(e.currentTarget.getBoundingClientRect())}>φ</button>
      </div>

      <button type="button" className={`ow-glass ow-pulse ${open ? "ow-pulse-open" : ""}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg className="ow-wave" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><path ref={wave} /></svg>
        <i className={`ow-dot ${syncOk ? "" : "ow-dot-bad"}`} />
        <span>
          {pulse ? <>{pulse.users} польз. <em>·</em> +{pulse.today} сегодня <em>·</em> msu.tj {timeHM(pulse.last_sync.at)}{syncOk ? "" : " · ошибка"}</> : "Пульт загружается…"}
        </span>
        <b aria-hidden="true">▾</b>
      </button>
      <div className={`ow-actions ${open ? "ow-actions-open" : ""}`}>
        <button type="button" className="ow-glass ow-act" disabled={!!busy} onClick={() => action("sync")}>{busy === "sync" ? "Проверяем…" : "Проверить msu.tj"}</button>
        <button type="button" className="ow-glass ow-act" disabled={!!busy} onClick={() => action("push")}>{busy === "push" ? "Отправляем…" : "Тестовый push"}</button>
        <button type="button" className="ow-glass ow-act" onClick={() => action("names")}>Замены ФИО</button>
        <button type="button" className="ow-glass ow-act" onClick={() => action("panel")}>Вся панель</button>
      </div>

      <label className="ow-glass ow-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input value={q} onChange={e => setQ(e.target.value)} onFocus={loadPool} placeholder="Группа, педагог, аудитория" aria-label="Поиск по всему" />
      </label>
      {hits.length > 0 && (
        <div className="ow-results">
          {hits.map(r => (
            <a key={r.href} href={r.href} className="ow-glass ow-res">
              <span><b>{r.title}</b><small>{r.sub}</small></span><em>{r.kind}</em>
            </a>
          ))}
        </div>
      )}
      {q.trim() && pool && hits.length === 0 && <p className="ow-none">Ничего не нашлось</p>}

      {spiral && <GoldenSpiral from={spiral} onDone={spiralDone} />}
      {toast && <div className="t-toast" role="status">{toast}</div>}
    </div>
  );
}
