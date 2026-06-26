"use client";

import { useState, useEffect, useRef } from "react";
import { api, Group } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true); // по умолчанию скрываем кнопку
  const [isIOS, setIsIOS] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installPromptRef = useRef<any>(null);

  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => {});
    const savedName = localStorage.getItem("user_name") ?? "";
    const savedGroup = localStorage.getItem("selected_group_id");
    setName(savedName);
    if (savedGroup) setSelectedGroupId(Number(savedGroup));
    setIsSetup(!savedGroup);

    // Проверяем возможность установки PWA
    const standalone =
      (window.navigator as { standalone?: boolean }).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (!standalone) {
      setIsInstalled(false);
      setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
      const handler = (e: Event) => {
        e.preventDefault();
        installPromptRef.current = e;
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
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

    // Сохраняем регистрацию на сервер
    let deviceId = localStorage.getItem("msu_device_id");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("msu_device_id", deviceId);
    }
    await api.registerUser(deviceId, name.trim() || "Аноним", Number(selectedGroupId));

    await new Promise(r => setTimeout(r, 300));
    setSaving(false);
    router.push("/");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "var(--background)" }}
    >
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
          {selectedGroup.year} курс · {selectedGroup.name}
        </p>
      )}
      {!selectedGroup && <div className="mb-8" />}

      {/* Форма */}
      <div className="w-full max-w-sm flex flex-col gap-3">
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
          <select
            className="w-full rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
            style={{
              background: "var(--card)",
              border: "0.5px solid var(--border)",
              color: selectedGroupId ? "var(--foreground)" : "var(--muted)",
            }}
            value={selectedGroupId}
            onChange={e => setSelectedGroupId(Number(e.target.value) || "")}
          >
            <option value="">— Выбери группу —</option>
            {["ЕНФ", "ГФ"].map(fac => (
              <optgroup key={fac} label={fac === "ЕНФ" ? "Естественнонаучный факультет" : "Гуманитарный факультет"}>
                {groups.filter(g => g.faculty_code === fac).map(g => (
                  <option key={g.id} value={g.id}>{g.year} курс — {g.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Кнопка */}
        <button
          onClick={handleSave}
          disabled={!selectedGroupId || saving}
          className="w-full py-3.5 rounded-xl text-base font-semibold text-white mt-2 transition-opacity disabled:opacity-40"
          style={{ background: "var(--primary)" }}
        >
          {saving ? "Сохраняем..." : isSetup ? "Начать" : "Сохранить"}
        </button>

        {/* Пропустить — только при первой настройке */}
        {isSetup && (
          <button
            onClick={() => router.push("/")}
            className="w-full py-2 text-sm transition-colors"
            style={{ color: "var(--muted)" }}
          >
            Пропустить
          </button>
        )}

        {/* При редактировании — кнопка назад */}
        {!isSetup && (
          <button
            onClick={() => router.back()}
            className="w-full py-2 text-sm transition-colors"
            style={{ color: "var(--muted)" }}
          >
            Отмена
          </button>
        )}

        {/* Установка PWA */}
        {!isInstalled && (
          <div
            className="mt-4 rounded-xl p-4 flex flex-col gap-3"
            style={{ background: "var(--card)", border: "0.5px solid var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: "var(--primary)" }}
              >
                МГУ
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                  Установить приложение
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Иконка на экране · работает офлайн
                </p>
              </div>
            </div>

            {isIOS ? (
              // iOS — инструкция вручную
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                Нажми{" "}
                <svg className="inline w-4 h-4 mb-0.5" fill="currentColor" viewBox="0 0 20 20" style={{ color: "var(--primary)" }}>
                  <path d="M10 2a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 8.586V3a1 1 0 011-1z"/>
                  <path d="M3 10a1 1 0 011-1h1a1 1 0 010 2H5v5h10v-5h-1a1 1 0 010-2h1a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2z"/>
                </svg>
                {" "}в нижней панели Safari → <strong>«На экран "Домой"»</strong>
              </p>
            ) : (
              <button
                onClick={async () => {
                  if (installPromptRef.current) {
                    await installPromptRef.current.prompt();
                    const { outcome } = await installPromptRef.current.userChoice;
                    if (outcome === "accepted") setIsInstalled(true);
                    installPromptRef.current = null;
                  } else {
                    // Если prompt недоступен — подсказка открыть из меню браузера
                    alert("Открой меню браузера (⋮) и выбери «Установить приложение» или «Добавить на главный экран»");
                  }
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity"
                style={{ background: "var(--primary)" }}
              >
                Установить
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
