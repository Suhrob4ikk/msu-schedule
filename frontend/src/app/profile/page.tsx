"use client";

import { useState, useEffect } from "react";
import { api, Group } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [isSetup, setIsSetup] = useState(false); // первый ли раз или редактируем

  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => {});
    const savedName = localStorage.getItem("user_name") ?? "";
    const savedGroup = localStorage.getItem("selected_group_id");
    setName(savedName);
    if (savedGroup) setSelectedGroupId(Number(savedGroup));
    // Если группа не выбрана — режим первоначальной настройки
    setIsSetup(!savedGroup);
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
      </div>
    </div>
  );
}
