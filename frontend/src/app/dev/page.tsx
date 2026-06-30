"use client";

import { useState, useEffect, useCallback, CSSProperties } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://msu-schedule-backend-production.up.railway.app/api";
const TOKEN_KEY = "dev_panel_token";

// ── собственная палитра, не связанная со стилями основного приложения ──
const c = {
  bg: "#0b0e14", panel: "#141a24", panel2: "#1b2330", border: "#2a3441",
  fg: "#e6edf3", muted: "#8b98a9", accent: "#39d3c0", red: "#ff6b6b",
  green: "#4ade80", yellow: "#fbbf24", inputBg: "#0f141c",
};
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

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
      if (!res.ok) { setErr("Неверный пароль"); setBusy(false); return; }
      const data = await res.json();
      saveToken(data.token, data.expires_in ?? 86400);
      onOk(data.token);
    } catch {
      setErr("Неверный пароль");
    }
    setBusy(false);
  };

  return (
    <div style={{ ...full, alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, width: 260 }}>
        <input
          type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)}
          style={{ background: c.inputBg, border: `1px solid ${c.border}`, color: c.fg,
            borderRadius: 8, padding: "12px 14px", fontSize: 15, outline: "none" }}
        />
        <button type="submit" disabled={busy}
          style={{ background: c.accent, color: "#04110f", border: "none", borderRadius: 8,
            padding: "11px", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : "→"}
        </button>
        {err && <div style={{ color: c.red, fontSize: 13, textAlign: "center" }}>{err}</div>}
      </form>
    </div>
  );
}

// ── мелкие UI-хелперы ───────────────────────────────────────────────────
const full: CSSProperties = { minHeight: "100vh", background: c.bg, color: c.fg,
  fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column" };
const card: CSSProperties = { background: c.panel, border: `1px solid ${c.border}`,
  borderRadius: 12, padding: 16 };
const h2: CSSProperties = { fontSize: 13, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: 1, color: c.muted, margin: "0 0 12px" };
const btn: CSSProperties = { background: c.panel2, color: c.fg, border: `1px solid ${c.border}`,
  borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 };

function Stat({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div style={{ background: c.panel2, borderRadius: 10, padding: "12px 14px", minWidth: 96 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: danger ? c.red : c.accent }}>{value}</div>
      <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{label}</div>
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
  const [msg, setMsg] = useState("");
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

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };
  const act = async (name: string, fn: () => Promise<any>) => {
    setBusy(name);
    try { const r = await fn(); flash(r?.message || JSON.stringify(r)); await refresh(); }
    catch (e: any) { if (e.message === "unauthorized") return onLogout(); flash("Ошибка: " + e.message); }
    setBusy("");
  };

  // клиентский замер реальных эндпоинтов
  const measure = async () => {
    const eps = ["/schedule/groups", "/schedule/teachers", "/schedule/weeks-all",
      "/schedule/free-rooms?day_of_week=понедельник&pair_number=I"];
    const out: Record<string, number> = {};
    for (const ep of eps) {
      const t0 = performance.now();
      try { await fetch(`${API}${ep}`); } catch {}
      out[ep.replace("/schedule/", "")] = Math.round(performance.now() - t0);
    }
    setClientPerf(out);
  };

  const saveOverride = () =>
    act("ovr", async () => { await api("/overrides", { method: "POST", body: JSON.stringify(edit) });
      setEdit({ subject: "", code: "", real_name: "" }); return { message: "Замена сохранена" }; });
  const delOverride = (id: number) =>
    act("ovr" + id, async () => { await api(`/overrides/${id}`, { method: "DELETE" }); return { message: "Удалено" }; });

  const loadRaw = async () => {
    if (!rawGroup) return;
    try { setRaw(await api<any>(`/raw?group_id=${rawGroup}`)); }
    catch (e: any) { flash("Ошибка: " + e.message); }
  };

  if (!ov) return <div style={{ ...full, alignItems: "center", justifyContent: "center", color: c.muted }}>загрузка…</div>;

  const fmt = (s?: string) => s ? new Date(s).toLocaleString("ru-RU") : "—";

  return (
    <div style={{ ...full, padding: 20, paddingBottom: 64, gap: 16, height: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: mono, fontSize: 14, color: c.accent }}>dev panel</div>
        <button onClick={onLogout} style={{ ...btn, fontSize: 12 }}>выйти</button>
      </div>
      {msg && <div style={{ ...card, padding: "10px 14px", color: c.yellow, fontFamily: mono, fontSize: 13 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>

        {/* Sync & Data */}
        <div style={card}>
          <h2 style={h2}>Синхронизация и данные</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Stat label="групп" value={ov.counts.groups} />
            <Stat label="пар (неделя)" value={ov.counts.lessons_current_week} />
            <Stat label="пар всего" value={ov.counts.lessons_total} />
            <Stat label="препод." value={ov.counts.teachers} />
            <Stat label="аудиторий" value={ov.counts.rooms} />
          </div>
          <div style={{ fontSize: 13, color: c.muted }}>
            Последняя синхронизация:{" "}
            <span style={{ color: ov.last_sync?.status === "success" ? c.green : ov.last_sync?.status === "error" ? c.red : c.muted }}>
              {ov.last_sync?.status ?? "—"}
            </span>{" "}· {fmt(ov.last_sync?.started_at)}
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{ov.last_sync?.message}</div>
        </div>

        {/* Zero-lesson groups */}
        <div style={card}>
          <h2 style={h2}>Группы без занятий (эта неделя)</h2>
          {ov.zero_lesson_groups.length === 0
            ? <div style={{ color: c.green, fontSize: 13 }}>нет — у всех групп есть пары</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ov.zero_lesson_groups.map((g: any) => (
                  <div key={g.id} style={{ fontSize: 12, color: c.red, fontFamily: mono }}>
                    {g.faculty} · {g.year}к · {g.name}
                  </div>
                ))}
              </div>}
        </div>

        {/* Manual controls */}
        <div style={card}>
          <h2 style={h2}>Ручные действия</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button style={btn} disabled={!!busy} onClick={() => act("sync", () => api("/sync", { method: "POST" }))}>
              {busy === "sync" ? "синхронизация…" : "Синхронизировать сейчас"}
            </button>
            <button style={btn} disabled={!!busy} onClick={() => act("cc", () => api("/clear-cache", { method: "POST" }))}>
              {busy === "cc" ? "…" : "Очистить кэш"}
            </button>
            <button style={btn} disabled={!!busy} onClick={() => act("rr", () => api("/rebuild-rooms", { method: "POST" }))}>
              {busy === "rr" ? "…" : "Пересобрать аудитории"}
            </button>
          </div>
        </div>

        {/* Sync logs */}
        <div style={card}>
          <h2 style={h2}>Последние синхронизации</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: mono, fontSize: 11 }}>
            {ov.sync_logs.map((s: any, i: number) => (
              <div key={i} style={{ color: c.muted }}>
                <span style={{ color: s.status === "success" ? c.green : s.status === "error" ? c.red : c.yellow }}>
                  {s.status}
                </span>{" "}{s.faculty} · {fmt(s.started_at)} · {s.message}
              </div>
            ))}
          </div>
        </div>

        {/* Teacher overrides */}
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <h2 style={h2}>Замены ФИО преподавателей</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {overrides.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 13 }}>
                <span style={{ color: c.yellow }}>{o.code}</span>
                <span style={{ color: c.muted }}>·</span>
                <span style={{ color: c.muted }}>{o.subject}</span>
                <span style={{ color: c.muted }}>→</span>
                <span style={{ color: c.green }}>{o.real_name}</span>
                <button onClick={() => delOverride(o.id)} style={{ ...btn, padding: "2px 8px", marginLeft: "auto", color: c.red }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["subject", "code", "real_name"] as const).map(k => (
              <input key={k} placeholder={{ subject: "предмет", code: "код (ИТУ)", real_name: "Фамилия И.О." }[k]}
                value={(edit as any)[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })}
                style={{ background: c.inputBg, border: `1px solid ${c.border}`, color: c.fg, borderRadius: 8,
                  padding: "8px 10px", fontSize: 13, flex: 1, minWidth: 120 }} />
            ))}
            <button style={{ ...btn, background: c.accent, color: "#04110f", border: "none" }} onClick={saveOverride}>
              Сохранить
            </button>
          </div>
        </div>

        {/* Performance */}
        <div style={card}>
          <h2 style={h2}>Производительность</h2>
          <div style={{ fontSize: 12, color: c.muted, marginBottom: 8 }}>
            Кэш аудиторий:{" "}
            <span style={{ color: perf?.free_rooms_cache?.warm ? c.green : c.yellow }}>
              {perf?.free_rooms_cache?.warm ? `тёплый (${perf.free_rooms_cache.entries})` : "холодный"}
            </span>
          </div>
          <button style={{ ...btn, marginBottom: 8 }} onClick={measure}>Замерить эндпоинты</button>
          <div style={{ fontFamily: mono, fontSize: 12 }}>
            {Object.entries(clientPerf).map(([k, v]) => (
              <div key={k} style={{ color: v > 1000 ? c.red : v > 500 ? c.yellow : c.green }}>{v}ms · {k}</div>
            ))}
          </div>
        </div>

        {/* Users & push */}
        <div style={card}>
          <h2 style={h2}>Пользователи и уведомления</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Stat label="зарегистр." value={users?.registered_users ?? "—"} />
            <Stat label="push-подписки" value={users?.push_subscribers ?? "—"} />
          </div>
          <button style={btn} disabled={!!busy} onClick={() => act("push", () => api("/test-push", { method: "POST" }))}>
            {busy === "push" ? "…" : "Тестовый push"}
          </button>
          {users && !users.vapid_configured &&
            <div style={{ fontSize: 11, color: c.yellow, marginTop: 8 }}>VAPID-ключи не настроены</div>}
        </div>

        {/* Raw data inspector */}
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <h2 style={h2}>Сырые данные (как отдаёт API сайту и мобильному)</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input placeholder="ID группы" value={rawGroup} onChange={e => setRawGroup(e.target.value)}
              style={{ background: c.inputBg, border: `1px solid ${c.border}`, color: c.fg, borderRadius: 8, padding: "8px 10px", fontSize: 13, width: 120 }} />
            <button style={btn} onClick={loadRaw}>Показать</button>
          </div>
          {raw && (
            <pre style={{ background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: 8, padding: 12,
              fontSize: 11, fontFamily: mono, color: c.muted, overflow: "auto", maxHeight: 360, margin: 0 }}>
              {JSON.stringify(raw, null, 2)}
            </pre>
          )}
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
