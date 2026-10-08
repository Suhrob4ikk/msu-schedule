"use client";

import { useState, useEffect, useCallback, CSSProperties, ReactNode } from "react";
import Link from "next/link";

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

  const api = useCallback(<T,>(p: string, o?: RequestInit) => devApi<T>(p, token, o), [token]);

  const refresh = useCallback(async () => {
    try {
      const [o, ovr, p, u] = await Promise.all([
        api<any>("/overview"), api<any[]>("/overrides"),
        api<any>("/performance"), api<any>("/users"),
      ]);
      setOv(o); setOverrides(ovr); setPerf(p); setUsers(u);
    } catch (e: any) { if (e.message === "unauthorized") onLogout(); }
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
      setEdit({ subject: "", code: "", real_name: "" }); return { message: "Замена сохранена и уже действует" }; });
  const delOverride = (o: any) => {
    if (!window.confirm(`Удалить замену «${o.code}» → «${o.real_name}»?`)) return;
    act("ovr" + o.id, async () => { await api(`/overrides/${o.id}`, { method: "DELETE" }); return { message: "Замена удалена" }; });
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
  const health =
    last?.status === "error"
      ? { tone: "red", text: "Последняя проверка msu.tj закончилась ошибкой", sub: last?.message }
      : zero.length > 0
        ? { tone: "yellow", text: `${zero.length} ${zero.length === 1 ? "группа" : "групп(ы)"} без пар на этой неделе`, sub: "Возможно, парсер не разобрал файл — список в разделе «Расписание в базе»" }
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              {([
                ["subject", "Предмет (как в расписании)", "информатика"],
                ["code", "Что стоит вместо ФИО", "ИТУ"],
                ["real_name", "Кого показывать", "Фамилия И.О."],
              ] as const).map(([k, label, ph]) => (
                <label key={k} style={{ fontSize: 12, color: c.muted, flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {label}
                  <input placeholder={ph} value={(edit as any)[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })} style={input} />
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
