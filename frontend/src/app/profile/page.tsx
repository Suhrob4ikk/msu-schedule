"use client";

import { useState, useEffect, useCallback } from "react";
import { api, Group, shortGroupName } from "@/lib/api";
import GroupSelector from "@/components/GroupSelector";
import Header from "@/components/Header";
import { useRouter } from "next/navigation";
import { getPushStatus, subscribePush, unsubscribePush, type PushStatus } from "@/lib/push";

import { featuresUnlocked } from "@/lib/features";

// Автооткрытие 1 сентября 2026 — см. lib/features.ts
const FEATURES_LOCKED = !featuresUnlocked();

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
  const toggle = () => {
    if (FEATURES_LOCKED) return;
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(storageKey, next ? "1" : "0");
  };
  return (
    <button
      onClick={toggle}
      className="flex items-center justify-between w-full py-3 px-4 rounded-xl border text-left"
      style={{ background: "var(--card)", borderColor: "var(--border)", opacity: FEATURES_LOCKED ? 0.6 : 1, cursor: FEATURES_LOCKED ? "default" : "pointer" }}
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{label}</p>
          {FEATURES_LOCKED && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--tag-bg)", color: "var(--muted)" }}>
              с 1 сентября
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {FEATURES_LOCKED ? `${description} · откроется 1 сентября` : description}
        </p>
      </div>
      <div
        className="relative shrink-0 ml-3 w-11 h-6 rounded-full"
        style={{ background: (!FEATURES_LOCKED && enabled) ? "var(--primary)" : "var(--border)" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow"
          style={{ transform: (!FEATURES_LOCKED && enabled) ? "translateX(20px)" : "translateX(2px)" }}
        />
      </div>
    </button>
  );
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

  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => { });
    const savedName = localStorage.getItem("user_name") ?? "";
    const savedGroup = localStorage.getItem("selected_group_id");
    const deviceId = localStorage.getItem("msu_device_id_v2");
    const setup = !savedGroup || !deviceId;
    setName(savedName);
    setSelectedGroupId(savedGroup ? Number(savedGroup) : "");
    setIsSetup(setup);
    setIsEditing(setup);
    setHydrated(true);
  }, []);

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
              <GroupSelector
                groups={groups}
                value={selectedGroup ?? null}
                onChange={g => setSelectedGroupId(g.id)}
              />
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
              <NotificationToggle
                sessionId={typeof window !== "undefined" ? (localStorage.getItem("msu_device_id_v2") ?? "") : ""}
                groupId={selectedGroupId}
              />
              <FeatureToggle
                label="Посещаемость"
                description="Отмечай, был ли ты на паре, и следи за статистикой семестра"
                storageKey="feature_attendance"
              />
              <FeatureToggle
                label="Заметки к парам"
                description="Записывай задания и важное к каждой паре"
                storageKey="feature_notes"
              />
            </div>
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
