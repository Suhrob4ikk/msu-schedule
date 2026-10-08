"use client";
/**
 * Кабинет в стиле «Табло» (макеты kabinet-*, vhod-*).
 *
 * Пока группа не выбрана (первый вход) или нажато «Изменить имя или группу»
 * (?edit=1) — экран «Вход» (components/tablo/profile/Login). Иначе две колонки:
 * слева профиль, «Учёба», «Разделы», «Синхронизация»; справа «Внешний вид» с
 * живым примером, ниже приглашение с QR и уведомления.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import Header from "@/components/Header";
import Icon from "@/components/tablo/Icon";
import Login from "@/components/tablo/profile/Login";
import { appearanceSummary } from "@/components/tablo/profile/AppearanceView";
import { useAppearance } from "@/lib/tablo/hooks";
import { api, clearApiCache, rememberGroup, shortGroupName, type Group } from "@/lib/api";
import { markGroupChosen } from "@/lib/features";
import { getInstallEvent, isIOS, isStandalone, onInstallChange, runInstall } from "@/lib/install";
import { getPushStatus, resyncPush, subscribePush, unsubscribePush, type PushStatus } from "@/lib/push";
import { collectNotes, collectSkips, type SkipStats } from "@/lib/studyData";
import { newLabel } from "@/lib/tablo/changes";

// ─── Мелочи ────────────────────────────────────────────────────────────────

function pluralPairs(n: number): string {
  const d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return "пара";
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return "пары";
  return "пар";
}

function Switch({ on, onClick, label, busy = false }: { on: boolean; onClick: () => void; label: string; busy?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={onClick} className={`t-sw ${on ? "t-sw-on" : ""}`}>
      <i />
    </button>
  );
}

/** Пропуски и заметки: выключены по умолчанию, хранятся только на устройстве (CLAUDE.md). */
function FeatureRow({ label, description, storageKey, onChange }: { label: string; description: string; storageKey: string; onChange?: () => void }) {
  const [on, setOn] = useState(false);
  useEffect(() => { try { setOn(localStorage.getItem(storageKey) === "1"); } catch { /* приватный режим */ } }, [storageKey]);
  const toggle = () => {
    const next = !on;
    setOn(next);
    try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* приватный режим */ }
    onChange?.();
  };
  return (
    <div className="t-pf-row">
      <div><b>{label}</b><span>{description}</span></div>
      <Switch on={on} onClick={toggle} label={label} />
    </div>
  );
}

async function exportMyData(st: SkipStats): Promise<string | null> {
  const notes = collectNotes();
  const lines: string[] = ["МГУ Расписание — мои данные", ""];
  if (st.total > 0) {
    lines.push(`Пропущено: ${st.total} ${pluralPairs(st.total)}`);
    st.bySubject.forEach(([s, n]) => lines.push(`  ${s} — ${n}`));
    lines.push("");
  }
  if (notes.length > 0) {
    lines.push("Заметки к парам:");
    notes.forEach(n => lines.push("• " + n.slot + ": " + n.text));
  }
  if (st.total === 0 && notes.length === 0) lines.push("Пока нет ни пропусков, ни заметок.");
  const text = lines.join("\n");
  try { if (navigator.share) { await navigator.share({ text }); return null; } } catch { return null; }
  try { await navigator.clipboard.writeText(text); return "Скопировано"; } catch { window.prompt("Ваши данные", text); return null; }
}

/** Уведомления сайта (Web Push): новая неделя, изменения и зачёты. */
function PushRow({ sessionId, groupId }: { sessionId: string; groupId: number | null }) {
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => { getPushStatus().then(setStatus); }, []);
  if (status === "loading" || status === "unsupported") return null;
  const isOn = status === "subscribed";
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    if (isOn) { await unsubscribePush(sessionId); setStatus("default"); }
    else if (groupId) setStatus(await subscribePush(sessionId, groupId));
    setBusy(false);
  };
  return (
    <div className="t-pf-row t-pf-row-flat">
      <div>
        <b>Уведомления на сайте</b>
        <span>{status === "denied" ? "Заблокированы в браузере: разрешите в его настройках" : "Новая неделя, изменения и зачёты"}</span>
      </div>
      {status !== "denied" && <Switch on={isOn} onClick={toggle} label="Уведомления на сайте" busy={busy || (!isOn && !groupId)} />}
    </div>
  );
}

// ─── Страница ──────────────────────────────────────────────────────────────

// Telegram владельца — ошибки и предложения. В приложении то же — src/profile/ProfileScreen.tsx
const DEVELOPER_TELEGRAM = "https://t.me/davlatov3007";

export default function ProfilePage() {
  const router = useRouter();
  const appearance = useAppearance();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsError, setGroupsError] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [isSetup, setIsSetup] = useState(true);
  const [isEditing, setIsEditing] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [skips, setSkips] = useState<SkipStats | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [apk, setApk] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const loadGroups = useCallback(() => {
    setGroupsError(false);
    api.getGroups().then(setGroups).catch(() => setGroupsError(true));
  }, []);

  useEffect(() => {
    loadGroups();
    let savedName = "", savedGroup: string | null = null, deviceId: string | null = null;
    try {
      savedName = localStorage.getItem("user_name") ?? "";
      savedGroup = localStorage.getItem("selected_group_id");
      deviceId = localStorage.getItem("msu_device_id_v2");
    } catch { /* приватный режим */ }
    const setup = !savedGroup || !deviceId;
    setName(savedName);
    setGroupId(savedGroup ? Number(savedGroup) : null);
    setIsSetup(setup);
    // ?edit=1 — «Сменить группу» из меню аватара: сразу форма выбора группы
    setIsEditing(setup || new URLSearchParams(window.location.search).get("edit") === "1");
    setOrigin(window.location.origin);
    setSkips(collectSkips());
    setHydrated(true);
    const ua = navigator.userAgent;
    if (!/iPhone|iPad|iPod/.test(ua)) api.getAppVersion().then(i => setApk(i.download_url)).catch(() => {});
  }, [loadGroups]);

  useEffect(() => {
    const sync = () => setCanInstall(!!getInstallEvent());
    sync();
    setIosHint(isIOS() && !isStandalone());
    return onInstallChange(sync);
  }, []);

  // Сколько записей в «Изменениях» новее прошлого визита
  useEffect(() => {
    if (!groupId || isEditing) return;
    api.getChanges(groupId).then(list => {
      let seen = 0;
      try { seen = Date.parse(localStorage.getItem("changes_last_seen") ?? "") || 0; } catch { /* приватный режим */ }
      setNewCount(list.filter(c => Date.parse(c.detected_at) > seen).length);
    }).catch(() => {});
  }, [groupId, isEditing]);

  const group = useMemo(() => groups.find(g => g.id === groupId) ?? null, [groups, groupId]);

  const handleSave = async () => {
    if (!group || !name.trim()) return;
    setSaving(true);
    try {
      localStorage.setItem("user_name", name.trim());
      localStorage.setItem("selected_group_id", String(group.id));
      localStorage.setItem("schedule_view_group_id", String(group.id));
    } catch { /* приватный режим */ }
    // Рядом с номером запоминаем название и курс: если номер разойдётся со списком, восстановимся по ним
    rememberGroup(group);
    markGroupChosen();
    let deviceId: string | null = null;
    try { deviceId = localStorage.getItem("msu_device_id_v2"); } catch { /* приватный режим */ }
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      try { localStorage.setItem("msu_device_id_v2", deviceId); } catch { /* приватный режим */ }
    }
    await api.registerUser(deviceId, name.trim(), group.id);
    // Подписка на уведомления помнит группу — без этого после смены группы уведомления шли бы о старой
    resyncPush(deviceId, group.id);
    window.dispatchEvent(new Event("storage"));
    setSaving(false);
    setIsEditing(false);
    router.push("/");
  };

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    clearApiCache();
    try {
      await Promise.all([api.getGroups(), api.getAllWeeks(), groupId ? api.getChanges(groupId) : Promise.resolve([])]);
      setToast("Расписание обновлено");
    } catch {
      setToast("Нет связи с сервером");
    }
    setSyncing(false);
  };

  if (!hydrated) {
    return (
      <div className="t-page flex items-center justify-center" style={{ minHeight: "100vh" }}>
        <div className="w-6 h-6 border-2 border-[var(--ink)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="t-page">
        {!isSetup && <Header />}
        <main className="t-main t-lg-main">
          <Login
            groups={groups} groupsError={groupsError} onRetry={loadGroups}
            name={name} onName={setName} group={group} onGroup={g => setGroupId(g.id)}
            saving={saving} isSetup={isSetup} onSave={handleSave}
            onCancel={isSetup ? undefined : () => setIsEditing(false)}
          />
        </main>
      </div>
    );
  }

  const letter = name.trim().charAt(0).toUpperCase();
  // Ссылку на панель разработчика видит только владелец. Это не защита — та
  // в пароле панели (DEV_PANEL_PASSWORD), — а чтобы студенты её не видели.
  // Те же имена — OWNER_NAMES в backend/app/api/routes/dev.py.
  const isOwner = ["сухроб", "suhrob"].includes(name.trim().split(/\s+/)[0]?.toLowerCase() ?? "");
  const deviceId = (() => { try { return localStorage.getItem("msu_device_id_v2") ?? ""; } catch { return ""; } })();

  return (
    <div className="t-page">
      <Header />
      <main className="t-main t-pf-main">
        <div className="t-pf">
            <section className="t-pf-card t-pf-me">
              <div className="t-pf-who">
                <span className="t-avatar t-avatar-lg" aria-hidden="true">{letter || <Icon name="user" size={26} />}</span>
                <div>
                  <h1>{name.trim() || "Без имени"}</h1>
                  {group && <p>{shortGroupName(group.name)} · {group.year} курс</p>}
                </div>
              </div>
              <button type="button" className="t-pf-link" onClick={() => setIsEditing(true)}>
                Изменить имя или группу<Icon name="chevronRight" size={20} />
              </button>
            </section>

            <h2 className="t-over t-pf-h">Оформление</h2>
            <nav className="t-pf-card t-pf-nav" aria-label="Оформление">
              <Link href="/profile/appearance">
                <span className="t-pf-ic"><Icon name="palette" size={22} /></span>
                <b>Внешний вид</b>
                {appearance && <em className="t-pf-sum">{appearanceSummary(appearance)}</em>}
                <Icon name="chevronRight" size={20} />
              </Link>
            </nav>

            <h2 className="t-over t-pf-h">Учёба</h2>
            <section className="t-pf-card">
              <FeatureRow label="Пропуски" description="Отмечайте только пропущенные пары" storageKey="feature_attendance" onChange={() => setSkips(collectSkips())} />
              {skips && skips.total > 0 && (
                <div className="t-pf-skips">
                  <p><strong>{skips.total}</strong> {pluralPairs(skips.total)} пропущено всего</p>
                  {skips.bySubject.map(([s, n]) => <div key={s}><span>{s}</span><b>{n}</b></div>)}
                </div>
              )}
              <FeatureRow label="Заметки к парам" description="Домашка и что принести" storageKey="feature_notes" />
              {(skips?.total || collectNotes().length > 0) ? (
                <button type="button" className="t-pf-export" onClick={async () => { const m = await exportMyData(skips ?? { total: 0, bySubject: [] }); if (m) setToast(m); }}>
                  <Icon name="share" size={18} />Поделиться заметками и пропусками
                </button>
              ) : null}
            </section>

            <h2 className="t-over t-pf-h">Разделы</h2>
            <nav className="t-pf-card t-pf-nav" aria-label="Разделы">
              <Link href="/changes">
                <span className="t-pf-ic"><Icon name="bell" size={22} /></span>
                <b>Изменения</b>
                {newCount > 0 && <em>{newLabel(newCount)}</em>}
                <Icon name="chevronRight" size={20} />
              </Link>
              <Link href="/compare">
                <span className="t-pf-ic"><Icon name="swap" size={22} /></span>
                <b>Сравнить с другой группой</b>
                <Icon name="chevronRight" size={20} />
              </Link>
              {groupId && (
                <a href={api.getIcsUrl(groupId)} download>
                  <span className="t-pf-ic"><Icon name="calendarPlus" size={22} /></span>
                  <b>Добавить в Google Календарь</b>
                  <Icon name="chevronRight" size={20} />
                </a>
              )}
              {canInstall ? (
                <button type="button" onClick={() => void runInstall()}>
                  <span className="t-pf-ic"><Icon name="download" size={22} /></span>
                  <b>Установить как приложение</b>
                  <Icon name="chevronRight" size={20} />
                </button>
              ) : iosHint ? (
                <p>
                  <span className="t-pf-ic"><Icon name="download" size={22} /></span>
                  <b>Установить: «Поделиться» → «На экран «Домой»»</b>
                </p>
              ) : null}
            </nav>

            <h2 className="t-over t-pf-h">Напоминания</h2>
              <section className="t-pf-card t-pf-notes">
                <PushRow sessionId={deviceId} groupId={groupId} />
                <p>Напоминания о зачётах и перед парой приходят в приложении для Android.</p>
                {apk && <a href={apk} className="t-pf-ghost"><Icon name="download" size={18} />Скачать APK</a>}
                {apk && (
                  <details className="t-pf-why">
                    <summary>Чем приложение удобнее сайта</summary>
                    <ul>
                      <li>Виджет со следующей парой на главном экране</li>
                      <li>Напоминания о зачётах накануне в 20:00 и за 10 минут до пары</li>
                      <li>Работает без интернета</li>
                    </ul>
                  </details>
                )}
              </section>
            <h2 className="t-over t-pf-h">Поделиться</h2>
              {origin && (
                <section className="t-pf-card t-pf-invite">
                  <div className="t-pf-qr"><QRCodeSVG value={origin} size={116} fgColor="#111111" bgColor="#ffffff" /></div>
                  <div>
                    <h3>Позвать одногруппников</h3>
                    <p>{origin.replace(/^https?:\/\//, "")}</p>
                    <button type="button" className="t-pf-ghost" onClick={async () => {
                      try {
                        if (navigator.share) { await navigator.share({ title: "МГУ Расписание", text: "МГУ Душанбе: расписание занятий. Заходите:", url: origin }); return; }
                      } catch { return; }
                      try { await navigator.clipboard.writeText(origin); setToast("Ссылка скопирована"); } catch { window.prompt("Ссылка", origin); }
                    }}><Icon name="share" size={18} />Поделиться ссылкой</button>
                  </div>
                </section>
              )}
            <h2 className="t-over t-pf-h">Синхронизация</h2>
            <section className="t-pf-card t-pf-sync">
              <button type="button" className="t-pf-refresh" onClick={syncNow} disabled={syncing}>
                <Icon name="history" size={20} />{syncing ? "Обновляем…" : "Обновить расписание"}
              </button>
            </section>
            {/* Связь с владельцем: ошибки и предложения (просьба владельца 8 окт 2026) */}
            <nav className="t-pf-card t-pf-nav t-pf-contact" aria-label="Связь">
              <a href={DEVELOPER_TELEGRAM} target="_blank" rel="noopener noreferrer">
                <span className="t-pf-ic"><Icon name="send" size={22} /></span>
                <b>Связаться с разработчиком</b>
                <Icon name="chevronRight" size={20} />
              </a>
            </nav>
            <p className="t-pf-foot">
              МГУ Душанбе · Расписание · Данные с msu.tj
              {isOwner && <> · <Link href="/dev">режим разработчика</Link></>}
            </p>
        </div>
      </main>
      {toast && <div className="t-toast" role="status">{toast}</div>}
    </div>
  );
}
