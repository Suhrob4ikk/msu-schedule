"use client";

import { useState, useEffect, useCallback } from "react";
import { api, Group, shortGroupName } from "@/lib/api";
import GroupSelector from "@/components/GroupSelector";
import Header from "@/components/Header";
import { useRouter } from "next/navigation";
import { getPushStatus, subscribePush, unsubscribePush, type PushStatus } from "@/lib/push";
import InviteCard from "@/components/InviteCard";
import ThemeSetting from "@/components/ThemeSetting";

import { featuresUnlocked, daysUntilUnlock, markGroupChosen } from "@/lib/features";
import { collectSkips, collectNotes, type SkipStats as SkipStatsType } from "@/lib/studyData";

// Автооткрытие 1 сентября 2026 — см. lib/features.ts.
// ВАЖНО: не выносить в константу модуля — она вычислялась бы один раз при
// загрузке страницы, и вкладка, открытая до полуночи 1 сентября, продолжала бы
// показывать «закрыто» до обновления. Проверяем на каждый рендер.

// ─── Уведомления о зачётах / экзаменах ────────────────────────────────────────────────────
function NotificationToggle({ sessionId, groupId }: { sessionId: string; groupId: number | "" }) {
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  const handleEnable = useCallback(async () => {
    if (!groupId || busy) return;
    setBusy(true);
    const next = await subscribePush(sessionId, Number(groupId));
    setStatus(next);
    setBusy(false);
  }, [sessionId, groupId, busy]);

  const handleDisable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await unsubscribePush(sessionId);
    setStatus("default");
    setBusy(false);
  }, [sessionId, busy]);

  if (status === "loading" || status === "unsupported") return null;

  const isOn = status === "subscribed";

  return (
    <div className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Уведомления о зачётах / экзаменах
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {status === "denied"
              ? "Заблокированы в браузере — разрешите в настройках"
              : isOn
              ? "Придёт напоминание накануне и в день зачёта"
              : "Напоминания накануне и в день зачёта / экзамена"}
          </p>
        </div>

        {status === "denied" ? (
          <span style={{ color: "var(--muted)", fontSize: 20 }}>🔕</span>
        ) : isOn ? (
          <button
            onClick={handleDisable}
            disabled={busy}
            className="relative shrink-0 w-11 h-6 rounded-full transition-colors"
            style={{ background: "var(--primary)", cursor: busy ? "default" : "pointer" }}
          >
            <span className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full shadow" />
          </button>
        ) : (
          <button
            onClick={handleEnable}
            disabled={busy || !groupId}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
            style={{ background: "var(--primary)", color: "#fff", cursor: busy ? "default" : "pointer" }}
          >
            {busy ? "..." : "Включить"}
          </button>
        )}
      </div>
    </div>
  );
}

function FeatureToggle({ label, description, storageKey }: { label: string; description: string; storageKey: string }) {
  const [enabled, setEnabled] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(storageKey) === "1" : false
  );
  const locked = !featuresUnlocked();
  const toggle = () => {
    if (locked) return;
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(storageKey, next ? "1" : "0");
  };
  return (
    <button
      onClick={toggle}
      className="flex items-center justify-between w-full py-3 px-4 rounded-xl border text-left"
      style={{ background: "var(--card)", borderColor: "var(--border)", opacity: locked ? 0.6 : 1, cursor: locked ? "default" : "pointer" }}
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{label}</p>
          {locked && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--tag-bg)", color: "var(--muted)" }}>
              с 1 сентября
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {locked ? `${description} · откроется 1 сентября, осталось ${daysUntilUnlock()} дн.` : description}
        </p>
      </div>
      <div
        className="relative shrink-0 ml-3 w-11 h-6 rounded-full"
        style={{ background: (!locked && enabled) ? "var(--primary)" : "var(--border)" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow"
          style={{ transform: (!locked && enabled) ? "translateX(20px)" : "translateX(2px)" }}
        />
      </div>
    </button>
  );
}

/** Склонение: 1 пара, 2 пары, 5 пар */
function pluralPairs(n: number): string {
  const d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return "пара";
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return "пары";
  return "пар";
}

function SkipStats() {
  const [st, setSt] = useState<SkipStatsType | null>(null);
  useEffect(() => { setSt(collectSkips()); }, []);

  if (!st) return null;

  // Пропусков нет — это хорошая новость, показываем её, а не пустоту
  if (st.total === 0) {
    return (
      <div className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Пропуски</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          Пока ни одного пропуска. Отмечай пропущенные пары в расписании — здесь будет видно, сколько их по каждому предмету.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Пропуски</p>
      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
        Всего пропущено: <span style={{ color: "#d43a40", fontWeight: 700 }}>{st.total} {pluralPairs(st.total)}</span>
      </p>
      <div className="flex flex-col gap-1 mt-2.5">
        {st.bySubject.map(([subject, n]) => (
          <div key={subject} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate" style={{ color: "var(--foreground)" }}>{subject}</span>
            <span className="shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Экспорт заметок и пропусков — поделиться или скопировать текстом
async function exportMyData() {
  const st = collectSkips();
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
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch { /* пользователь отменил шаринг — не страшно */ }
  try {
    await navigator.clipboard.writeText(text);
    alert("Скопировано в буфер обмена — вставь в Telegram или заметки.");
  } catch { alert(text); }
}

export default function ProfilePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  // Значения из localStorage инициализируем серверно-нейтрально и заполняем
  // после монтирования — иначе первый клиентский рендер расходится с SSR (#418).
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [isSetup, setIsSetup] = useState(true);
  const [isEditing, setIsEditing] = useState(true);
  // Считаем на каждый рендер, а не один раз при загрузке модуля — см. комментарий
  // у импорта featuresUnlocked.
  const featuresLocked = !featuresUnlocked();

  // Список групп не пришёл — на первом запуске без сети это тупик: под
  // «НАПРАВЛЕНИЕ» пусто, выбрать нечего, и почему — неизвестно. Показываем
  // честную причину и кнопку «Повторить».
  const [groupsError, setGroupsError] = useState(false);
  const loadGroups = useCallback(() => {
    setGroupsError(false);
    api.getGroups().then(setGroups).catch(() => setGroupsError(true));
  }, []);

  useEffect(() => {
    loadGroups();
    const savedName = localStorage.getItem("user_name") ?? "";
    const savedGroup = localStorage.getItem("selected_group_id");
    const deviceId = localStorage.getItem("msu_device_id_v2");
    const setup = !savedGroup || !deviceId;
    setName(savedName);
    setSelectedGroupId(savedGroup ? Number(savedGroup) : "");
    setIsSetup(setup);
    setIsEditing(setup);
    setHydrated(true);
  }, [loadGroups]);

  const selectedGroup = groups.find(g => g.id === Number(selectedGroupId));

  const initials = name.trim()
    ? name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const handleSave = async () => {
    if (!selectedGroupId) return;
    setSaving(true);
    localStorage.setItem("user_name", name.trim());
    localStorage.setItem("selected_group_id", String(selectedGroupId));
    localStorage.setItem("schedule_view_group_id", String(selectedGroupId));
    // Отмечаем момент выбора: по нему решаем, спрашивать ли про курс после
    // смены учебного года (новичков спрашивать не нужно).
    markGroupChosen();

    // Сохраняем регистрацию на сервер
    let deviceId = localStorage.getItem("msu_device_id_v2");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("msu_device_id_v2", deviceId);
    }
    await api.registerUser(deviceId, name.trim() || "Аноним", Number(selectedGroupId));

    await new Promise(r => setTimeout(r, 300));
    setSaving(false);
    setIsEditing(false);
    router.push("/");
  };

  const handleChangeGroup = () => {
    if (confirm("Изменить имя или группу? Например при переходе на новый курс.")) {
      setIsEditing(true);
    }
  };

  // До монтирования отдаём нейтральный экран — совпадает с SSR, убирает #418.
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* Шапка с навигацией — для зарегистрированных (на десктопе видно меню,
          на мобиле работает нижняя панель). Во время первичной настройки прячем. */}
      {!isSetup && <Header />}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 pb-24 lg:pb-8">
      {/* Лого вверху */}
      <div className="flex items-center gap-2 mb-10">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm"
          style={{ background: "var(--primary)" }}
        >
          МГУ
        </div>
        <div>
          <p className="font-bold text-base" style={{ color: "var(--foreground)" }}>МГУ Душанбе</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Расписание занятий</p>
        </div>
      </div>

      {/* Аватар */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mb-4 text-3xl font-bold text-white"
        style={{ background: "var(--primary)", opacity: name.trim() ? 1 : 0.4, transition: "opacity 0.2s" }}
      >
        {initials}
      </div>

      {name.trim() && (
        <p className="font-semibold text-lg mb-1" style={{ color: "var(--foreground)" }}>{name.trim()}</p>
      )}
      {selectedGroup && (
        <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
          {selectedGroup.year} курс · {shortGroupName(selectedGroup.name)}
        </p>
      )}
      {!selectedGroup && <div className="mb-8" />}

      {/* Подсказка — только в режиме редактирования */}
      {isEditing && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2 mb-4 w-full max-w-sm" style={{ background: "var(--tag-bg)" }}>
          <svg className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--primary)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Укажи имя и группу — расписание будет открываться сразу на твою группу.</p>
        </div>
      )}

      {/* Форма или кнопка изменения */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        {isEditing ? (
          <>
            {/* Имя */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wider" style={{ color: "var(--muted)", textTransform: "uppercase" }}>
                Имя
              </label>
              <input
                type="text"
                placeholder="Введи своё имя..."
                autoFocus={isSetup}
                className="w-full rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                style={{
                  background: "var(--card)",
                  border: "0.5px solid var(--border)",
                  color: "var(--foreground)",
                }}
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Группа */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wider" style={{ color: "var(--muted)", textTransform: "uppercase" }}>
                Группа
              </label>
              {groups.length === 0 && groupsError ? (
                <div
                  className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: "var(--card)", border: "0.5px solid var(--border)", color: "var(--muted)" }}
                >
                  <span>Список групп не загрузился — нет связи с сервером.</span>
                  <button
                    onClick={loadGroups}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
                    style={{ background: "var(--primary)" }}
                  >
                    Повторить
                  </button>
                </div>
              ) : (
                <GroupSelector
                  groups={groups}
                  value={selectedGroup ?? null}
                  onChange={g => setSelectedGroupId(g.id)}
                />
              )}
            </div>

            {/* Кнопка сохранить */}
            <button
              onClick={handleSave}
              disabled={!selectedGroupId || saving}
              className="w-full py-3.5 rounded-xl text-base font-semibold text-white mt-2 transition-opacity disabled:opacity-40"
              style={{ background: "var(--primary)" }}
            >
              {saving ? "Сохраняем..." : isSetup ? "Начать" : "Сохранить"}
            </button>

            {/* Отмена — только если уже зарегистрирован */}
            {!isSetup && (
              <button
                onClick={() => setIsEditing(false)}
                className="w-full py-2 text-sm transition-colors"
                style={{ color: "var(--muted)" }}
              >
                Отмена
              </button>
            )}
          </>
        ) : (
          /* Кнопка перехода в режим редактирования */
          <button
            onClick={handleChangeGroup}
            className="w-full py-3 rounded-xl text-sm font-medium border transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted)" }}
          >
            ✏ Изменить имя или группу
          </button>
        )}

        {/* Дополнительные возможности — только после регистрации */}
        {!isSetup && (
          <div className="pt-6 mt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
              Дополнительные возможности
            </p>
            <div className="flex flex-col gap-2.5">
              <ThemeSetting />
              <NotificationToggle
                sessionId={typeof window !== "undefined" ? (localStorage.getItem("msu_device_id_v2") ?? "") : ""}
                groupId={selectedGroupId}
              />
              <FeatureToggle
                label="Пропуски"
                description="Отмечай только пары, которые пропустил. Здесь будет видно, сколько пропусков накопилось по каждому предмету"
                storageKey="feature_attendance"
              />
              <FeatureToggle
                label="Заметки к парам"
                description="Домашка и что принести. Заметку можно закрепить за парой — тогда она появится в этот день каждую неделю"
                storageKey="feature_notes"
              />
            </div>
          </div>
        )}

        {/* Статистика, экспорт и история изменений */}
        {!isSetup && (
          <div className="flex flex-col gap-2.5 mt-2">
            <InviteCard />
            {!featuresLocked && <SkipStats />}
            {!featuresLocked && (
              <button
                onClick={exportMyData}
                className="w-full py-3 rounded-xl text-sm font-medium border transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted)" }}
                
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                  Поделиться заметками и посещаемостью
                </span>
              </button>
            )}
            <a
              href="/compare"
              className="w-full py-3 rounded-xl text-sm font-medium border text-center transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted)" }}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
                Сравнить с другой группой
              </span>
            </a>
          </div>
        )}

        {/* Режим разработчика — открывает скрытую панель /dev (вход по паролю) */}
        {!isSetup && (
          <a
            href="/dev"
            className="text-center text-xs mt-4 transition-opacity hover:opacity-100"
            style={{ color: "var(--muted)", opacity: 0.55 }}
          >
            Режим разработчика
          </a>
        )}

      </div>
      </div>
    </div>
  );
}
