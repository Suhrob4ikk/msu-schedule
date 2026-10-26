"use client";

import { useState, useEffect, useCallback, useRef, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { shortGroupName } from "@/lib/api";

// Панель разработчика. Инструкция для владельца — docs/Панель разработчика - инструкция.html
// в корне репозитория. Меняете разделы здесь — поправьте и её.

// URL бэкенда — единственный источник правды в next.config.ts (там же fallback).
const API = process.env.NEXT_PUBLIC_API_URL!;
const TOKEN_KEY = "dev_panel_token";

// ── собственная палитра, не связанная со стилями основного приложения ──
const c = {
  bg: "#0b0e14", panel: "#131923", panel2: "#1a2230", border: "#263140",
  fg: "#e6edf3", muted: "#8b98a9", faint: "#5f6b7b", accent: "#39d3c0", onAccent: "#04110f",
  red: "#ff6b6b", redBg: "#2a1517", green: "#4ade80", greenBg: "#11241a",
  yellow: "#fbbf24", yellowBg: "#2a2110", inputBg: "#0f141c",
};
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const TZ = "Asia/Dushanbe";

type Sess = { token: string; exp: number };
function loadToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const s: Sess = JSON.parse(raw);
    if (s.exp < Date.now()) { sessionStorage.removeItem(TOKEN_KEY); return null; }
    return s.token;
  } catch { return null; }
}
function saveToken(token: string, ttlSec: number) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + ttlSec * 1000 }));
}

async function devApi<T>(path: string, token: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/dev${path}`, {
    ...opts,
    headers: { "X-Dev-Token": token, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 404) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`error ${res.status}`);
  return res.json();
}

// ── время ─────────────────────────────────────────────────────────────────
// Сервер пишет время в UTC без пометки зоны («2026-10-08T06:00:00»). Браузер
// принял бы его за местное — и показывал время на 5 часов раньше душанбинского.
function parseUtc(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
  return isNaN(d.getTime()) ? null : d;
}
const fmtTime = (d: Date | null) =>
  d ? d.toLocaleString("ru-RU", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
function ago(d: Date | null): string {
  if (!d) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч ${min % 60} мин назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

// «Файл не изменился: Wed, 07 Oct 2026 14:00:04 GMT» → «файл на msu.tj не менялся с 7 окт., 19:00»
function syncMessage(m?: string | null): string {
  if (!m) return "";
  const match = m.match(/^Файл не изменился:\s*(.+)$/);
  if (match) {
    const d = new Date(match[1]);
    if (!isNaN(d.getTime())) return `файл на msu.tj не менялся с ${fmtTime(d)}`;
  }
  return m;
}

const STATUS: Record<string, { label: string; color: string }> = {
  success: { label: "обновлено", color: c.green },
  no_change: { label: "без изменений", color: c.muted },
  error: { label: "ошибка", color: c.red },
  running: { label: "идёт…", color: c.yellow },
};

// ── экран пароля ──────────────────────────────────────────────────────────
function Login({ onOk }: { onOk: (t: string) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${API}/dev/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) { setErr("Неверный пароль. После 5 ошибок вход закрывается на 15 минут."); setBusy(false); return; }
      const data = await res.json();
      saveToken(data.token, data.expires_in ?? 86400);
      onOk(data.token);
    } catch {
      setErr("Неверный пароль. После 5 ошибок вход закрывается на 15 минут.");
    }
    setBusy(false);
  };

  return (
    <div style={{ ...full, alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ ...card, display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320, padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Панель разработчика</div>
        <div style={{ fontSize: 13, color: c.muted, marginTop: -6 }}>МГУ Расписание · только для владельца</div>
        <label style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>
          Пароль
          <input
            type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)}
            style={{ ...input, width: "100%", marginTop: 6, padding: "12px 14px", fontSize: 15 }}
          />
        </label>
        <button type="submit" disabled={busy || !pw} style={{ ...btnPrimary, padding: 12, fontSize: 15, opacity: busy || !pw ? 0.6 : 1 }}>
          {busy ? "Проверяем…" : "Войти"}
        </button>
        {err && <div style={{ color: c.red, fontSize: 13, lineHeight: 1.4 }}>{err}</div>}
        {/* Сайт часто открыт как установленное приложение — без кнопки «Назад» браузера */}
        <Link href="/profile" style={{ ...btn, textAlign: "center", textDecoration: "none", padding: 11, fontSize: 14 }}>
          ← Вернуться в расписание
        </Link>
      </form>
    </div>
  );
}

// ── мелкие UI-хелперы ───────────────────────────────────────────────────
const full: CSSProperties = { minHeight: "100vh", background: c.bg, color: c.fg,
  fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", display: "flex", flexDirection: "column" };
const card: CSSProperties = { background: c.panel, border: `1px solid ${c.border}`,
  borderRadius: 14, padding: 18, minWidth: 0 };
const btn: CSSProperties = { background: c.panel2, color: c.fg, border: `1px solid ${c.border}`,
  borderRadius: 9, padding: "9px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 };
const btnPrimary: CSSProperties = { ...btn, background: c.accent, color: c.onAccent, border: "none" };
const input: CSSProperties = { background: c.inputBg, border: `1px solid ${c.border}`, color: c.fg,
  borderRadius: 9, padding: "9px 11px", fontSize: 13, outline: "none", boxSizing: "border-box" };

function Section({ title, hint, wide, children }: { title: string; hint: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section style={{ ...card, ...(wide ? { gridColumn: "1 / -1" } : {}) }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 12.5, color: c.muted, margin: "4px 0 14px", lineHeight: 1.45 }}>{hint}</p>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "red" | "muted" }) {
  return (
    <div style={{ background: c.panel2, borderRadius: 10, padding: "10px 12px", flex: "1 1 90px", minWidth: 90 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: tone === "red" ? c.red : tone === "muted" ? c.fg : c.accent }}>{value}</div>
      <div style={{ fontSize: 11.5, color: c.muted, marginTop: 2, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

function Action({ label, busyLabel, hint, busy, disabled, onClick }: {
  label: string; busyLabel: string; hint: string; busy: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
      <button style={{ ...btn, opacity: disabled && !busy ? 0.5 : 1 }} disabled={disabled} onClick={onClick}>
        {busy ? busyLabel : label}
      </button>
      <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

// ── Полные имена преподавателей (backend/app/services/full_names.py) ─────
// «1 курс · ГОСУДАРСТВЕННОЕ И МУНИЦИПАЛЬНОЕ УПРАВЛЕНИЕ» → «1 курс ГМУ»
const shortGroups = (gs: string[]) => gs.map(g => {
  const [year, name] = g.split(" · ");
  return name ? `${year} ${shortGroupName(name)}` : g;
}).join(", ");
const STATUS_RU: Record<string, string> = { open: "в опросе", pending: "на проверке", final: "утверждено" };
const votesWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "голос" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "голоса" : "голосов");

function FullNamesSection({ data, busy, act, api }: {
  data: any;
  busy: string;
  act: (name: string, fn: () => Promise<any>) => Promise<void>;
  api: <T>(p: string, o?: RequestInit) => Promise<T>;
}) {
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [manual, setManual] = useState<Record<string, string>>({});
  if (!data) return null;
  const post = (path: string, body?: object) => api(path, { method: "POST", body: JSON.stringify(body ?? {}) });
  const pending: any[] = data.pending;
  const teachers: any[] = data.teachers.filter((t: any) => filter === "all" || (!t.final && t.current));
  const finalCount = data.teachers.filter((t: any) => t.final).length;
  const todoCount = data.teachers.filter((t: any) => !t.final && t.current).length;

  return (
    <Section wide title="Полные имена преподавателей" hint={<>Студенты, у которых преподаватель ведёт пары, видят опрос «Знаете полное имя?». Новые варианты, вписанные студентами, другим не видны, пока вы их не <b style={{ color: c.fg }}>разрешите</b>. Полное имя появляется у всех только после <b style={{ color: c.fg }}>«Утвердить»</b>. Письмо о новых вариантах приходит раз в день в 13:00.</>}>

      <div style={{ fontSize: 13.5, fontWeight: 700, margin: "4px 0 8px" }}>
        Ждут проверки: <span style={{ color: pending.length ? c.yellow : c.green }}>{pending.length || "нет"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {pending.map((p: any) => (
          <div key={p.id} style={{ background: c.panel2, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 14.5 }}>
              <b style={{ color: c.yellow }}>{p.teacher}</b>
              <span style={{ color: c.muted }}> · {shortGroups(p.groups) || "на этой неделе пар нет"}</span>
            </div>
            <div style={{ margin: "8px 0", fontSize: 15 }}>
              Новый вариант: <b>{p.name}</b>
              <span style={{ color: c.muted, fontSize: 12.5 }}> · {p.votes} {votesWord(p.votes)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: c.muted, marginBottom: 6 }}>Уже есть:</div>
            {p.others.length === 0 && <div style={{ fontSize: 13, color: c.muted, marginBottom: 6 }}>других вариантов нет</div>}
            {p.others.map((o: any) => (
              <div key={o.id ?? "final"} style={{ fontSize: 13.5, padding: "7px 10px", borderRadius: 9, marginBottom: 6,
                border: `1px solid ${o.similar ? c.yellow + "66" : c.border}`, background: o.similar ? c.yellowBg : "transparent" }}>
                {o.name} <span style={{ color: c.muted }}>· {STATUS_RU[o.status] ?? o.status}{o.status !== "final" ? ` · ${o.votes} ${votesWord(o.votes)}` : ""}{o.source === "msu.tj" ? " · с msu.tj" : ""}</span>
                {o.similar && <div style={{ color: c.yellow, fontSize: 12.5 }}>⚠ {o.similar}</div>}
              </div>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              <button style={btnPrimary} disabled={!!busy}
                onClick={() => act("fa" + p.id, async () => { await post(`/full-names/variants/${p.id}/approve`); return { message: `«${p.name}» теперь в опросе у всех` }; })}>
                Разрешить как новый
              </button>
              {p.others.filter((o: any) => o.similar && o.id).map((o: any) => (
                <button key={o.id} style={btn} disabled={!!busy}
                  onClick={() => act("fm" + p.id, async () => { await post(`/full-names/variants/${p.id}/merge/${o.id}`); return { message: `Голос перенесён в «${o.name}»` }; })}>
                  Это то же, что «{o.name}» — засчитать туда
                </button>
              ))}
              <button style={{ ...btn, color: c.red }} disabled={!!busy}
                onClick={() => {
                  if (!window.confirm(`Отклонить «${p.name}»? Кто за него голосовал, сможет ответить заново.`)) return;
                  act("fr" + p.id, async () => { await post(`/full-names/variants/${p.id}/reject`); return { message: "Вариант отклонён" }; });
                }}>
                Отклонить
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", background: c.panel2, borderRadius: 10, padding: 3 }}>
          {([["todo", `Без имени · ${todoCount}`], ["all", `Все · утверждено ${finalCount}`]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ ...btn, border: "none", padding: "6px 12px",
              background: filter === v ? c.panel : "transparent", color: filter === v ? c.fg : c.muted }}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: c.muted }}>«Без имени» — ведут пары на этой или следующей неделе, полное имя не утверждено</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {teachers.map((t: any) => (
          <div key={t.teacher} style={{ background: c.panel2, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
              <b style={{ fontSize: 14.5 }}>{t.teacher}</b>
              {t.final
                ? <span style={{ color: c.green, fontSize: 14 }}>→ {t.final}</span>
                : <span style={{ color: c.muted, fontSize: 12.5 }}>{t.groups.length ? shortGroups(t.groups) : "сейчас пар нет"}</span>}
              {t.final && (
                <button style={{ ...btn, padding: "3px 10px", fontSize: 12, marginLeft: "auto", color: c.red }} disabled={!!busy}
                  onClick={() => {
                    if (!window.confirm(`Убрать полное имя у ${t.teacher}? Опрос по нему снова откроется.`)) return;
                    act("fx" + t.teacher, async () => { await post("/full-names/final", { teacher: t.teacher, full_name: null }); return { message: "Полное имя убрано" }; });
                  }}>Убрать</button>
              )}
            </div>
            {!t.final && (
              <>
                {t.variants.map((v: any) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, marginTop: 6, flexWrap: "wrap" }}>
                    <span>{v.name}</span>
                    <span style={{ color: c.muted, fontSize: 12.5 }}>{v.votes} {votesWord(v.votes)} · {STATUS_RU[v.status] ?? v.status}{v.source === "msu.tj" ? " · с msu.tj" : ""}</span>
                    <button style={{ ...btn, padding: "3px 10px", fontSize: 12, marginLeft: "auto" }} disabled={!!busy || v.status !== "open"}
                      title={v.status !== "open" ? "Сначала разрешите вариант выше" : undefined}
                      onClick={() => act("ff" + v.id, async () => { await post("/full-names/final", { teacher: t.teacher, full_name: v.name }); return { message: `Утверждено: ${t.teacher} → ${v.name}` }; })}>
                      Утвердить
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input placeholder="Вписать самому: Имя Отчество" value={manual[t.teacher] ?? ""}
                    onChange={e => setManual({ ...manual, [t.teacher]: e.target.value })} style={{ ...input, flex: 1, minWidth: 0 }} />
                  <button style={btn} disabled={!!busy || !(manual[t.teacher] ?? "").trim()}
                    onClick={() => act("fw" + t.teacher, async () => {
                      await post("/full-names/final", { teacher: t.teacher, full_name: manual[t.teacher] });
                      setManual({ ...manual, [t.teacher]: "" });
                      return { message: `Утверждено: ${t.teacher} → ${manual[t.teacher]}` };
                    })}>Утвердить</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── дашборд ───────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [ov, setOv] = useState<any>(null);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [perf, setPerf] = useState<any>(null);
  const [users, setUsers] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [edit, setEdit] = useState({ subject: "", code: "", real_name: "" });
  const [rawGroup, setRawGroup] = useState("");
  const [raw, setRaw] = useState<any>(null);
  const [clientPerf, setClientPerf] = useState<Record<string, number>>({});
  const [missing, setMissing] = useState<any[]>([]);
  const [names, setNames] = useState<any>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [msgNote, setMsgNote] = useState<Record<string, string>>({});
  // Правка своего сообщения: какое и черновик текста
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [owners, setOwners] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]);
  const [userQ, setUserQ] = useState("");
  const [whoDir, setWhoDir] = useState<string | null>(null);   // «Кто зарегистрирован»: направление
  const [whoYear, setWhoYear] = useState<number | null>(null); // и курс
  const [myDevice, setMyDevice] = useState("");
  const [ownerLabel, setOwnerLabel] = useState("");
  useEffect(() => {
    try { setMyDevice(localStorage.getItem("msu_device_id_v2") ?? ""); } catch { /* приватный режим */ }
    setOwnerLabel(/iPhone|Android/i.test(navigator.userAgent) ? "Телефон" : "Компьютер");
  }, []);
  const overrideForm = useRef<HTMLDivElement>(null);
  const realNameInput = useRef<HTMLInputElement>(null);

  const api = useCallback(<T,>(p: string, o?: RequestInit) => devApi<T>(p, token, o), [token]);

  const refresh = useCallback(async () => {
    try {
      const [o, ovr, p, u] = await Promise.all([
        api<any>("/overview"), api<any[]>("/overrides"),
        api<any>("/performance"), api<any>("/users"),
      ]);
      setOv(o); setOverrides(ovr); setPerf(p); setUsers(u);
    } catch (e: any) { if (e.message === "unauthorized") onLogout(); }
    // Отдельно и без выхода при ошибке: на старом сервере этого адреса ещё нет
    try { setMissing(await api<any[]>("/missing-teachers")); } catch { setMissing([]); }
    try { setNames(await api<any>("/full-names")); } catch { setNames(null); }
    try { setFeedback(await api<any[]>("/feedback")); } catch { setFeedback([]); }
    try { setMessages(await api<any[]>("/messages")); } catch { setMessages([]); }
    try { setOwners(await api<any[]>("/owner-devices")); } catch { setOwners([]); }
    try { setUserList(await api<any[]>("/users/list")); } catch { setUserList([]); }
  }, [api, onLogout]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    fetch(`${API}/schedule/groups`).then(r => r.json()).then(setGroups).catch(() => {});
  }, []);

  const flash = (text: string, bad = false) => { setMsg({ text, bad }); setTimeout(() => setMsg(null), 6000); };
  const describe = (r: any): string => {
    if (r?.message) return r.message;
    if (Array.isArray(r?.results)) {
      return r.results.map((x: any) =>
        `${x.faculty}: ${STATUS[x.status]?.label ?? x.status}${x.changes ? `, изменений ${x.changes}` : ""}${x.error ? ` — ${x.error}` : ""}`
      ).join(" · ");
    }
    return "Готово";
  };
  const act = async (name: string, fn: () => Promise<any>) => {
    setBusy(name);
    try { const r = await fn(); flash(describe(r)); await refresh(); }
    catch (e: any) { if (e.message === "unauthorized") return onLogout(); flash("Ошибка: " + e.message, true); }
    setBusy("");
  };

  // замер из браузера — то же, что чувствует студент (через прокси Vercel)
  const measure = async () => {
    setBusy("measure");
    const eps: [string, string][] = [
      ["Список групп", "/schedule/groups"],
      ["Педагоги", "/schedule/teachers"],
      ["Недели", "/schedule/weeks-all"],
      ["Свободные аудитории", "/schedule/free-rooms?day_of_week=понедельник&pair_number=I"],
      ["Всё для офлайна (bulk-sync)", "/schedule/bulk-sync"],
    ];
    const out: Record<string, number> = {};
    for (const [label, ep] of eps) {
      const t0 = performance.now();
      try { await fetch(`${API}${ep}`, { cache: "no-store" }); } catch {}
      out[label] = Math.round(performance.now() - t0);
    }
    setClientPerf(out);
    setBusy("");
  };

  const saveOverride = () =>
    act("ovr", async () => { await api("/overrides", { method: "POST", body: JSON.stringify(edit) });
      setEdit({ subject: "", code: "", real_name: "" });
      return { message: "Замена сохранена: в расписании имя уже новое. Чтобы преподаватель появился в «Педагогах», нажмите «Проверить msu.tj сейчас»." }; });
  const delOverride = (o: any) => {
    if (!window.confirm(`Удалить замену «${o.code}» → «${o.real_name}»?`)) return;
    act("ovr" + o.id, async () => { await api(`/overrides/${o.id}`, { method: "DELETE" }); return { message: "Замена удалена" }; });
  };

  // «Сделать замену» из списка «Нет в «Педагогах»»: поля предмета и кода — ровно
  // как на сервере, осталось вписать ФИО
  const startOverride = (m: any) => {
    setEdit({ subject: m.subject, code: m.teacher, real_name: "" });
    overrideForm.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => realNameInput.current?.focus(), 400);
  };

  const loadRaw = async () => {
    if (!rawGroup) return;
    try { setRaw(await api<any>(`/raw?group_id=${rawGroup}`)); }
    catch (e: any) { flash("Ошибка: " + e.message, true); }
  };

  if (!ov) return <div style={{ ...full, alignItems: "center", justifyContent: "center", color: c.muted }}>Загрузка…</div>;

  const last = ov.last_sync;
  const lastAt = parseUtc(last?.started_at);
  const zero = ov.zero_lesson_groups as any[];
  const missingNew = missing.filter(m => !m.override);
  // Переписки (13 окт 2026): сервер отдаёт ключ `thread` — устройство и анонимно ли;
  // сообщения разработчика — свои строки (from_dev). Ждёт ответа — если последним писал студент.
  const threads = (() => {
    const by = new Map<string, any[]>();
    for (const m of messages) {
      const k = m.thread ?? String(m.id);
      by.set(k, [...(by.get(k) ?? []), m]);
    }
    return [...by.entries()].map(([key, list]) => {
      const items = [...list].reverse(); // сервер отдаёт свежие сначала, в переписке — по порядку
      const student = [...items].reverse().find(m => !m.from_dev) ?? items[0];
      return { key, items, last: items[items.length - 1], student };
    });
  })();
  const unanswered = threads.filter(t => !t.last.from_dev);
  const sendReply = async (key: string, id: number) => {
    const text = (replies[key] ?? "").trim();
    if (!text) return;
    try {
      const r = await api<any>(`/messages/${id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      setMsgNote(n => ({ ...n, [key]: r.message }));
      setReplies(rs => ({ ...rs, [key]: "" }));
      setMessages(await api<any[]>("/messages"));
    } catch (e: any) { setMsgNote(n => ({ ...n, [key]: e.message || "Не удалось отправить" })); }
  };
  const saveEdit = async (key: string) => {
    if (!editing || !editing.text.trim()) return;
    try {
      await api(`/messages/${editing.id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: editing.text }) });
      setEditing(null);
      setMsgNote(n => ({ ...n, [key]: "Исправлено" }));
      setMessages(await api<any[]>("/messages"));
    } catch (e: any) { setMsgNote(n => ({ ...n, [key]: e.message || "Не удалось исправить" })); }
  };
  const deleteMessage = async (id: number) => {
    if (!window.confirm("Удалить сообщение? У студента оно тоже исчезнет.")) return;
    try { await api(`/messages/${id}`, { method: "DELETE" }); setMessages(ms => ms.filter(m => m.id !== id)); } catch { /* сеть */ }
  };
  const health =
    last?.status === "error"
      ? { tone: "red", text: "Последняя проверка msu.tj закончилась ошибкой", sub: last?.message }
      : zero.length > 0
        ? { tone: "yellow", text: `${zero.length} ${zero.length === 1 ? "группа" : "групп(ы)"} без пар на этой неделе`, sub: "Возможно, парсер не разобрал файл — список в разделе «Расписание в базе»" }
        : unanswered.length > 0
        ? { tone: "yellow", text: `${unanswered.length} ${unanswered.length === 1 ? "вопрос ждёт" : "вопроса(ов) ждут"} ответа`, sub: "Раздел «Вопросы» ниже" }
        : names?.pending?.length > 0
        ? { tone: "yellow", text: `${names.pending.length} ${names.pending.length === 1 ? "вариант имени ждёт" : "вариантов имён ждут"} проверки`, sub: "Раздел «Полные имена преподавателей» ниже" }
        : missingNew.length > 0
        ? { tone: "yellow", text: `${missingNew.length} ${missingNew.length === 1 ? "преподавателя" : "преподавателей"} не видно во вкладке «Педагоги»`, sub: "Список и кнопка «Сделать замену» — в разделе «Нет во вкладке «Педагоги»» ниже" }
        : { tone: "green", text: "Всё в порядке", sub: `msu.tj проверялся ${ago(lastAt)} · ${syncMessage(last?.message)}` };
  const toneBg = { red: c.redBg, yellow: c.yellowBg, green: c.greenBg }[health.tone]!;
  const toneFg = { red: c.red, yellow: c.yellow, green: c.green }[health.tone]!;

  return (
    <div style={{ ...full, padding: "20px 16px 64px", gap: 16 }}>
      <div style={{ width: "100%", maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Панель разработчика</div>
            <div style={{ fontSize: 13, color: c.muted }}>МГУ Расписание · время везде душанбинское</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => act("refresh", async () => ({ message: "Данные обновлены" }))} style={btn} disabled={!!busy}>
              {busy === "refresh" ? "Обновляем…" : "Обновить"}
            </button>
            <button onClick={onLogout} style={btn}>Выйти</button>
            <Link href="/profile" style={{ ...btn, textDecoration: "none" }}>На сайт</Link>
          </div>
        </header>

        <div style={{ background: toneBg, border: `1px solid ${toneFg}40`, borderRadius: 14, padding: "14px 18px" }}>
          <div style={{ color: toneFg, fontWeight: 700, fontSize: 15 }}>{health.text}</div>
          {health.sub && <div style={{ color: c.muted, fontSize: 13, marginTop: 3 }}>{health.sub}</div>}
        </div>

        {msg && (
          <div key={msg.text} className="anim-slide-up" role="status"
            style={{ ...card, padding: "12px 16px", color: msg.bad ? c.red : c.yellow, fontSize: 13.5, lineHeight: 1.45 }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,340px),1fr))", gap: 16 }}>

          <Section title="Расписание в базе" hint="Сколько всего сейчас знает сервер. Резко упало число групп или пар, или появились группы без пар в будни — скорее всего, msu.tj выложил файл в другом формате и парсер его не разобрал.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Stat label="групп" value={ov.counts.groups} />
              <Stat label="пар на этой неделе" value={ov.counts.lessons_current_week} />
              <Stat label="преподавателей" value={ov.counts.teachers} />
              <Stat label="аудиторий" value={ov.counts.rooms} />
              <Stat label="пар в архиве всего" value={ov.counts.lessons_total} tone="muted" />
            </div>
            <div style={{ marginTop: 14, fontSize: 13 }}>
              <div style={{ color: c.muted, marginBottom: 4 }}>Группы без единой пары на этой неделе:</div>
              {zero.length === 0
                ? <div style={{ color: c.green }}>нет — у всех групп есть пары</div>
                : zero.map((g: any) => (
                    <div key={g.id} style={{ color: c.red }}>{g.faculty} · {g.year} курс · {g.name}</div>
                  ))}
            </div>
          </Section>

          <Section title="Пользователи" hint="Приложение сообщает серверу свою версию, сайт — нет. Кто пользуется и тем и другим, посчитан дважды.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Stat label="всего зарегистрировано" value={users?.registered_users ?? "—"} />
              <Stat label="с приложением" value={users?.app_users ?? "—"} />
              <Stat label="только сайт" value={users?.site_users ?? "—"} />
            </div>
            {users?.app_versions?.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ fontSize: 12, color: c.muted }}>Версии приложения у студентов:</div>
                {users.app_versions.map((v: any, i: number) => {
                  const max = users.app_versions.reduce((m: number, x: any) => Math.max(m, x.count), 1);
                  return (
                    <div key={v.version} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <span style={{ width: 52, fontFamily: mono, color: i === 0 ? c.accent : c.fg }}>{v.version}</span>
                      <span style={{ flex: 1, height: 8, background: c.panel2, borderRadius: 4, overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: `${(v.count / max) * 100}%`, background: i === 0 ? c.accent : c.faint, borderRadius: 4 }} />
                      </span>
                      <span style={{ width: 32, textAlign: "right", color: c.muted }}>{v.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Поиск и удаление — для тестовых регистраций («Шахзода Тест» и т. п.) */}
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <input value={userQ} onChange={e => setUserQ(e.target.value)} placeholder="Найти по имени, например «тест»" style={input} />
              {userQ.trim() && (() => {
                const q = userQ.trim().toLowerCase().replace(/ё/g, "е");
                const found = userList.filter((u: any) => String(u.name).toLowerCase().replace(/ё/g, "е").includes(q));
                if (found.length === 0) return <div style={{ fontSize: 13, color: c.muted }}>Никого не нашлось</div>;
                return found.slice(0, 30).map((u: any) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, background: c.panel2, borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{u.name}</b>{u.app_version && <span style={{ color: c.muted }}> · приложение {u.app_version}</span>}
                      <div style={{ color: c.faint, fontSize: 12 }}>{u.group ?? "без группы"} · с {fmtTime(parseUtc(u.registered_at))}</div>
                    </div>
                    <button style={btn} disabled={!!busy} onClick={() => {
                      if (!window.confirm(`Удалить «${u.name}» из пользователей?

Если этот браузер или телефон снова откроет сайт с тем же именем, он зарегистрируется заново — поменяйте там имя.`)) return;
                      act("user" + u.id, () => api(`/users/${u.id}`, { method: "DELETE" }));
                    }}>{busy === "user" + u.id ? "Удаляем…" : "Удалить"}</button>
                  </div>
                ));
              })()}
            </div>
          </Section>

          <Section title="Кто зарегистрирован" hint={<>Выберите направление и курс — как на сайте. Видно, кто в группе, с приложения или с сайта, включены ли уведомления и <b style={{ color: c.fg }}>когда последний раз заходил на сайт</b>. Заходы сайт сообщает раз в 30 минут, сервер записывает их в базу несколько раз в сутки (панель видит и свежие). Из приложения заход попадает сюда, когда оно само обновляет регистрацию (не при каждом запуске); пока такого не было — «заход неизвестен».</>}>
            {(() => {
              // Один человек = одно имя в одной группе, даже если он заходил с нескольких устройств
              // (у каждого устройства своя регистрация — см. «двойники» в CLAUDE.md). Склеиваем для показа.
              const norm = (n: string) => String(n).toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");
              const merged = new Map<string, any>();
              for (const u of userList) {
                const k = `${norm(u.name)}|${u.group_name ?? ""}|${u.year ?? ""}`;
                const m = merged.get(k);
                if (!m) { merged.set(k, { ...u, devices: [u] }); continue; }
                m.devices.push(u);
                const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
                m.last_seen_at = later(m.last_seen_at, u.last_seen_at);
                m.updated_at = later(m.updated_at, u.updated_at);
                m.registered_at = !m.registered_at ? u.registered_at : !u.registered_at ? m.registered_at : u.registered_at < m.registered_at ? u.registered_at : m.registered_at;
                m.app_push = m.app_push || u.app_push;
                m.web_push = m.web_push || u.web_push;
                m.app_version = m.app_version || u.app_version;
              }
              const persons = [...merged.values()];
              const dirs = new Map<string, any[]>();
              for (const u of persons) {
                const key = u.group_name ? shortGroupName(u.group_name) : "Без группы";
                dirs.set(key, [...(dirs.get(key) ?? []), u]);
              }
              const dirNames = [...dirs.keys()].sort((a, b) => (a === "Без группы" ? 1 : b === "Без группы" ? -1 : a.localeCompare(b, "ru")));
              const inDir = whoDir ? dirs.get(whoDir) ?? [] : [];
              const years = [...new Set(inDir.map((u: any) => u.year).filter((y: any) => y != null))].sort() as number[];
              const people = inDir
                .filter((u: any) => whoYear == null || u.year === whoYear || (whoYear === 0 && u.year == null))
                .sort((a: any, b: any) => String(b.last_seen_at ?? b.updated_at ?? "").localeCompare(String(a.last_seen_at ?? a.updated_at ?? "")));
              const chip = (on: boolean): CSSProperties => ({ ...btn, background: on ? c.accent : c.panel2, color: on ? "#fff" : c.fg, borderColor: on ? c.accent : c.border });
              const seen = (u: any): { text: string; tone: string } => {
                const exact = parseUtc(u.last_seen_at);
                const d = exact ?? parseUtc(u.updated_at);
                if (!d) return { text: u.app_version ? "заход неизвестен" : "—", tone: c.faint };
                const days = (Date.now() - d.getTime()) / 86400000;
                const when = days < 1 && new Date().toDateString() === d.toDateString() ? `сегодня ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ago(d);
                return { text: (exact ? "" : "≈ ") + when, tone: days <= 1 ? c.green : days <= 7 ? c.fg : c.yellow };
              };
              if (userList.length === 0) return <div style={{ fontSize: 13, color: c.muted }}>Пока никого нет</div>;
              const extra = userList.length - persons.length;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 12, color: c.muted }}>
                    {persons.length} {persons.length % 10 >= 2 && persons.length % 10 <= 4 && (persons.length % 100 < 12 || persons.length % 100 > 14) ? "человека" : "человек"} · {userList.length} устройств{extra > 0 ? ` (повторы одного человека склеены: ${extra})` : ""}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>Направление</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {dirNames.map(d => (
                        <button key={d} style={chip(whoDir === d)} onClick={() => { setWhoDir(d); setWhoYear(null); }}>{d} · {dirs.get(d)!.length}</button>
                      ))}
                    </div>
                  </div>
                  {whoDir && (
                    <div>
                      <div style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>Курс</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <button style={chip(whoYear == null)} onClick={() => setWhoYear(null)}>Все курсы · {inDir.length}</button>
                        {years.map(y => (
                          <button key={y} style={chip(whoYear === y)} onClick={() => setWhoYear(y)}>{y} курс · {inDir.filter((u: any) => u.year === y).length}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {whoDir && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontSize: 12, color: c.muted }}>
                        {people.length} {(() => { const n = people.length % 100, d = n % 10; return d >= 2 && d <= 4 && (n < 12 || n > 14) ? "человека" : "человек"; })()} · первыми — кто заходил позже всех
                      </div>
                      {people.map((u: any) => {
                        const sn = seen(u);
                        return (
                          <div key={u.id} style={{ background: c.panel2, borderRadius: 10, padding: "8px 12px", fontSize: 13, display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <b>{u.name}</b>
                              <span style={{ color: c.muted }}> · {u.year ? `${u.year} курс` : "без курса"}</span>
                              {u.devices.length > 1 && <span style={{ color: c.yellow }}> · {u.devices.length} {u.devices.length < 5 ? "устройства" : "устройств"}</span>}
                              <div style={{ color: c.faint, fontSize: 12 }}>
                                {u.devices.length > 1
                                  ? `${u.devices.filter((d: any) => d.app_version).length ? "приложение и сайт" : "только сайт"}`
                                  : u.app_version ? `приложение ${u.app_version}` : "сайт"} · зарегистрирован {fmtTime(parseUtc(u.registered_at))}
                                {" · "}уведомления: {[u.app_push && "приложение", u.web_push && "сайт"].filter(Boolean).join(" и ") || "нет"}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", whiteSpace: "nowrap", color: sn.tone, fontWeight: 600 }}>{sn.text}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </Section>

          <Section title="Мои устройства" hint={<>На этих устройствах сайт включает <b style={{ color: c.fg }}>ваше оформление</b>. Привязать можно только отсюда, с паролем — по имени или коду это не включить. Права админа это не даёт: панель всё равно спрашивает пароль. Новый телефон — откройте на нём панель и нажмите кнопку.</>}>
            {(() => {
              const mine = owners.some((o: any) => o.device_id === myDevice);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {!myDevice ? (
                    <div style={{ fontSize: 13, color: c.yellow }}>У этого браузера ещё нет номера устройства — откройте на сайте Кабинет и выберите группу.</div>
                  ) : mine ? (
                    <div style={{ fontSize: 13, color: c.green }}>Это устройство уже ваше.</div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input value={ownerLabel} onChange={e => setOwnerLabel(e.target.value)} placeholder="Название, например «Телефон»" style={{ ...input, flex: "1 1 160px" }} />
                      <button style={btnPrimary} disabled={!!busy} onClick={() => act("owner", async () => {
                        await api("/owner-devices", { method: "POST", body: JSON.stringify({ device_id: myDevice, label: ownerLabel }) });
                        try { localStorage.removeItem("owner_device"); } catch { /* приватный режим */ }
                        return { message: "Устройство привязано. Откройте сайт заново — включится ваше оформление." };
                      })}>{busy === "owner" ? "Привязываем…" : "Это моё устройство"}</button>
                    </div>
                  )}
                  {owners.length === 0
                    ? <div style={{ fontSize: 13, color: c.muted }}>Пока ни одного устройства</div>
                    : owners.map((o: any) => (
                        <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, background: c.panel2, borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b>{o.label || "Устройство"}</b>{o.device_id === myDevice && <span style={{ color: c.green }}> · это устройство</span>}
                            <div style={{ color: c.faint, fontSize: 12 }}>привязано {fmtTime(parseUtc(o.created_at))} · …{String(o.device_id).slice(-6)}</div>
                          </div>
                          <button style={btn} disabled={!!busy} onClick={() => {
                            if (!window.confirm(`Отвязать «${o.label || "устройство"}»?`)) return;
                            act("owner" + o.id, async () => { await api(`/owner-devices/${o.id}`, { method: "DELETE" }); return { message: "Устройство отвязано" }; });
                          }}>Отвязать</button>
                        </div>
                      ))}
                </div>
              );
            })()}
          </Section>

          <Section title={`Вопросы${unanswered.length ? ` · ${unanswered.length} без ответа` : ""}`} hint={<>Кабинет сайта → «Написать разработчику» (вместо ссылки на ваш Telegram). Каждый студент — одна переписка, писать можно несколько сообщений подряд, свои — исправить («изм.»). Каждый вопрос приходит и на почту, кроме ваших (Сухроб, ПМиИ 3) и тестовых. Ваши сообщения студент увидит там же, в Кабинете, и получит уведомление, если включал их на сайте. «Аноним» — студент попросил не показывать имя: оно не сохраняется вовсе.</>}>
            {threads.length === 0
              ? <div style={{ fontSize: 13, color: c.muted }}>Пока вопросов нет</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {threads.map(({ key, items, last, student }) => (
                    <div key={key} style={{ background: c.panel2, borderRadius: 10, padding: "10px 12px", borderLeft: last.from_dev ? undefined : `3px solid ${c.yellow}` }}>
                      <div style={{ fontSize: 13 }}>
                        <b>{student.name}</b>{student.group && <span style={{ color: c.faint }}> · {student.group}</span>}
                      </div>
                      {items.map((m: any) => (
                        <div key={m.id} style={m.from_dev
                          ? { borderLeft: `2px solid ${c.green}`, paddingLeft: 10, margin: "8px 0 0" }
                          : { margin: "8px 0 0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: c.muted }}>
                            <span>
                              {m.from_dev ? "Вы" : "Студент"} · {fmtTime(parseUtc(m.created_at))}
                              {m.edited && " · изменено"}
                              {m.from_dev && (m.seen ? " · прочитано" : " · ещё не прочитано")}
                            </span>
                            <span style={{ whiteSpace: "nowrap" }}>
                              {m.from_dev && editing?.id !== m.id && (
                                <button onClick={() => setEditing({ id: m.id, text: m.text })} title="Исправить сообщение"
                                  style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", fontSize: 12, padding: 0 }}>изм.</button>
                              )}
                              <button onClick={() => deleteMessage(m.id)} aria-label="Удалить сообщение" title="Удалить сообщение"
                                style={{ background: "none", border: "none", color: c.red, cursor: "pointer", fontSize: 14, marginLeft: 8, padding: 0 }}>×</button>
                            </span>
                          </div>
                          {editing?.id === m.id
                            ? <>
                                <textarea value={editing?.text ?? ""} onChange={e => setEditing({ id: m.id, text: e.target.value })} rows={2}
                                  style={{ ...input, width: "100%", resize: "vertical", fontFamily: "inherit", marginTop: 4 }} />
                                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                                  <button style={btn} disabled={!editing?.text.trim()} onClick={() => saveEdit(key)}>Сохранить</button>
                                  <button style={btn} onClick={() => setEditing(null)}>Отмена</button>
                                </div>
                              </>
                            : <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", marginTop: 2, color: c.fg }}>{m.text}</div>}
                        </div>
                      ))}
                      <textarea
                        value={replies[key] ?? ""}
                        onChange={e => setReplies(rs => ({ ...rs, [key]: e.target.value }))}
                        placeholder="Сообщение студенту"
                        rows={2}
                        style={{ ...input, width: "100%", resize: "vertical", fontFamily: "inherit", marginTop: 10 }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <button style={btn} disabled={!(replies[key] ?? "").trim()} onClick={() => sendReply(key, student.id)}>Отправить</button>
                        {msgNote[key] && <span style={{ fontSize: 12, color: c.muted }}>{msgNote[key]}</span>}
                      </div>
                    </div>
                  ))}
                </div>}
          </Section>

          <Section title="Отзывы о дизайне" hint="Отзывы из «золотого профиля» (frontend/src/lib/special.ts). Кнопку на сайте убрали, когда отзыв оставлен; каждый отзыв ещё и приходил вам на почту.">
            {feedback.length === 0
              ? <div style={{ fontSize: 13, color: c.muted }}>Пока отзывов нет</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {feedback.map((f: any) => (
                    <div key={f.id} style={{ background: c.panel2, borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                        <b>{f.name}</b>
                        <span style={{ color: c.muted }}>{fmtTime(parseUtc(f.created_at))}</span>
                      </div>
                      <div style={{ color: c.yellow, fontSize: 17, letterSpacing: 2, margin: "2px 0" }}>{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</div>
                      {f.text && <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{f.text}</div>}
                      {f.group && <div style={{ fontSize: 12, color: c.faint, marginTop: 4 }}>{f.group}</div>}
                    </div>
                  ))}
                </div>}
          </Section>

          <Section title="Уведомления" hint={<>Сколько устройств получают push. Тестовый push уходит <b style={{ color: c.fg }}>только на ваши устройства</b> — те, где в Кабинете имя «Сухроб» или «Suhrob».</>}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <Stat label="push в приложении" value={users?.expo_tokens ?? "—"} />
              <Stat label="push на сайте" value={users?.push_subscribers ?? "—"} />
              <Stat label="ваших устройств" value={users?.owner_devices ?? "—"} tone={users?.owner_devices === 0 ? "red" : undefined} />
            </div>
            <Action label="Отправить тестовый push себе" busyLabel="Отправляем…" busy={busy === "push"} disabled={!!busy}
              hint="Проверка, что уведомления вообще доходят. Студентам не придёт."
              onClick={() => act("push", () => api("/test-push", { method: "POST" }))} />
            {users && !users.vapid_configured &&
              <div style={{ fontSize: 12, color: c.yellow, marginTop: 8 }}>На сервере не заданы VAPID-ключи — push на сайте не работает.</div>}
          </Section>

          <Section title="Проверки msu.tj" hint="Сервер сам проверяет, не обновился ли файл: в субботу днём раз в 5 мин, в будни раз в 30 мин, ночью спит. ЕНФ и ГФ — два факультета, два файла.">
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {ov.sync_logs.map((s: any, i: number) => {
                const st = STATUS[s.status] ?? { label: s.status, color: c.muted };
                return (
                  <div key={i} style={{ fontSize: 12.5, lineHeight: 1.4, display: "flex", gap: 8 }}>
                    <span style={{ color: c.muted, width: 92, flexShrink: 0 }}>{fmtTime(parseUtc(s.started_at))}</span>
                    <span style={{ width: 30, flexShrink: 0, fontWeight: 600 }}>{s.faculty}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                      {s.status !== "no_change" && s.message && <span style={{ color: c.muted }}> · {syncMessage(s.message)}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Кнопки" hint="Все три безопасны: ничего не удаляют у студентов и не шлют им уведомлений, если расписание не изменилось.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <Action label="Проверить msu.tj сейчас" busyLabel="Проверяем… до минуты" busy={busy === "sync"} disabled={!!busy}
                hint="Скачать оба файла заново, не дожидаясь расписания проверок. Если что-то изменилось — студенты получат push, как обычно."
                onClick={() => act("sync", () => api("/sync", { method: "POST" }))} />
              <Action label="Очистить кэш" busyLabel="Очищаем…" busy={busy === "cc"} disabled={!!busy}
                hint="Сервер забудет готовые ответы и соберёт их заново из базы. Когда на сайте или в приложении видно старое."
                onClick={() => act("cc", () => api("/clear-cache", { method: "POST" }))} />
              <Action label="Пересобрать аудитории" busyLabel="Пересобираем…" busy={busy === "rr"} disabled={!!busy}
                hint="Склеить дубли («лабФИЗ» и «лабфиз») и убрать мусорные аудитории без пар."
                onClick={() => act("rr", () => api("/rebuild-rooms", { method: "POST" }))} />
            </div>
          </Section>

          <Section title="Скорость" hint="Сколько ждёт студент. Зелёное — до 0,5 с, жёлтое — до 1 с, красное — дольше (сервер, возможно, только проснулся — замерьте ещё раз).">
            <div style={{ fontSize: 12.5, color: c.muted, marginBottom: 10 }}>
              Готовых ответов в памяти сервера: <span style={{ color: c.fg }}>{perf?.response_cache?.entries ?? "—"}</span>
            </div>
            <button style={{ ...btn, marginBottom: 10 }} onClick={measure} disabled={!!busy}>
              {busy === "measure" ? "Замеряем…" : "Замерить скорость"}
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              {Object.entries(clientPerf).map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 10 }}>
                  <span style={{ width: 70, fontFamily: mono, color: v > 1000 ? c.red : v > 500 ? c.yellow : c.green }}>{(v / 1000).toFixed(2)} с</span>
                  <span style={{ color: c.muted }}>{k}</span>
                </div>
              ))}
            </div>
          </Section>

          <FullNamesSection data={names} busy={busy} act={act} api={api} />

          <Section wide title="Нет во вкладке «Педагоги»" hint={<>Сервер сам находит тех, кто ведёт пары на этой или следующей неделе, но не попадает в список педагогов: в файле msu.tj у них нет инициалов («Шодибеки Сафар») или вместо имени код кафедры. Нажмите <b style={{ color: c.fg }}>«Сделать замену»</b> — поля ниже заполнятся сами, останется вписать «Фамилия И.О.».</>}>
            {missing.length === 0
              ? <div style={{ color: c.green, fontSize: 14 }}>Все преподаватели этой и следующей недели есть в «Педагогах»</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {missing.map((m) => (
                    <div key={m.subject + m.teacher} style={{ display: "flex", alignItems: "center", gap: 12, background: c.panel2, borderRadius: 10, padding: "10px 12px", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                        <div style={{ fontSize: 14.5 }}>
                          <span style={{ color: c.yellow, fontWeight: 700 }}>{m.teacher}</span>
                          <span style={{ color: c.muted }}> · {m.subject}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: c.muted, marginTop: 2 }}>
                          {m.groups.join(", ")} · {m.lessons} {m.lessons === 1 ? "пара" : m.lessons < 5 ? "пары" : "пар"}
                        </div>
                      </div>
                      {m.override
                        ? <div style={{ fontSize: 12.5, color: c.green, maxWidth: 320, lineHeight: 1.4 }}>
                            Замена на «{m.override}» есть. Чтобы он появился в «Педагогах», нажмите «Проверить msu.tj сейчас».
                          </div>
                        : <button style={btnPrimary} onClick={() => startOverride(m)}>Сделать замену</button>}
                    </div>
                  ))}
                </div>}
          </Section>

          <Section wide title="Замены ФИО преподавателей" hint={<>В файле msu.tj вместо преподавателя иногда стоит код кафедры («ИТУ», «английский»). Здесь можно сказать: «если предмет — <i>информатика</i> и стоит код <i>ИТУ</i>, показывать <i>Джумаев Э.Х.</i>». Действует сразу, у всех.</>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {overrides.length === 0 && <div style={{ fontSize: 13, color: c.muted }}>Замен пока нет</div>}
              {overrides.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, background: c.panel2, borderRadius: 9, padding: "8px 10px", flexWrap: "wrap" }}>
                  <span style={{ color: c.muted }}>{o.subject}</span>
                  <span style={{ color: c.yellow, fontWeight: 600 }}>{o.code}</span>
                  <span style={{ color: c.muted }}>→</span>
                  <span style={{ color: c.green, fontWeight: 600 }}>{o.real_name}</span>
                  <button onClick={() => delOverride(o)} disabled={!!busy}
                    style={{ ...btn, padding: "4px 10px", marginLeft: "auto", color: c.red, fontSize: 12 }}>Удалить</button>
                </div>
              ))}
            </div>
            <div ref={overrideForm} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              {([
                ["subject", "Предмет (как в расписании)", "информатика"],
                ["code", "Что стоит вместо ФИО", "ИТУ"],
                ["real_name", "Кого показывать", "Фамилия И.О."],
              ] as const).map(([k, label, ph]) => (
                <label key={k} style={{ fontSize: 12, color: c.muted, flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {label}
                  <input placeholder={ph} value={(edit as any)[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })} style={input}
                    ref={k === "real_name" ? realNameInput : undefined} />
                </label>
              ))}
              <button style={{ ...btnPrimary, opacity: edit.subject && edit.code && edit.real_name ? 1 : 0.5 }}
                disabled={!edit.subject || !edit.code || !edit.real_name || !!busy} onClick={saveOverride}>
                Сохранить замену
              </button>
            </div>
          </Section>

          <Section wide title="Сырые данные группы" hint="Ровно то, что сервер отдаёт сайту и приложению, — для споров «в приложении не так, как на msu.tj». Текущая неделя.">
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <select value={rawGroup} onChange={e => setRawGroup(e.target.value)} style={{ ...input, flex: "1 1 240px", maxWidth: 420 }}>
                <option value="">Выберите группу…</option>
                {groups.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.faculty_code} · {g.year} курс · {g.name}</option>
                ))}
              </select>
              <button style={btn} onClick={loadRaw} disabled={!rawGroup}>Показать</button>
            </div>
            {raw && (
              <pre style={{ background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: 9, padding: 12,
                fontSize: 11.5, fontFamily: mono, color: c.muted, overflow: "auto", maxHeight: 380, margin: 0 }}>
                {JSON.stringify(raw, null, 2)}
              </pre>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function DevPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setToken(loadToken()); setReady(true); }, []);
  const logout = () => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); };

  if (!ready) return <div style={{ ...full }} />;
  if (!token) return <Login onOk={setToken} />;
  return <Dashboard token={token} onLogout={logout} />;
}
