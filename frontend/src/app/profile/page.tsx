"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { api, Group } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => {});
    const savedName = localStorage.getItem("user_name") ?? "";
    const savedGroup = localStorage.getItem("selected_group_id");
    setName(savedName);
    if (savedGroup) setSelectedGroupId(Number(savedGroup));
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
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleGoToSchedule = () => {
    router.push("/");
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Header />
      <main className="max-w-md mx-auto px-4 py-8 pb-28 lg:pb-8">

        {/* Аватар */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-3 text-2xl font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            {initials}
          </div>
          {name && (
            <p className="font-semibold text-lg" style={{ color: "var(--foreground)" }}>{name}</p>
          )}
          {selectedGroup && (
            <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
              {selectedGroup.year} курс · {selectedGroup.name}
            </p>
          )}
        </div>

        {/* Форма */}
        <div className="card mb-4">
          <h2 className="font-semibold text-sm mb-3" style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Моё имя
          </h2>
          <input
            type="text"
            placeholder="Введи своё имя..."
            className="w-full rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            style={{ background: "var(--background)", border: "0.5px solid var(--border)", color: "var(--foreground)" }}
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false); }}
          />
        </div>

        <div className="card mb-6">
          <h2 className="font-semibold text-sm mb-3" style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Моя группа
          </h2>
          <select
            className="w-full rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            style={{ background: "var(--background)", border: "0.5px solid var(--border)", color: "var(--foreground)" }}
            value={selectedGroupId}
            onChange={e => { setSelectedGroupId(Number(e.target.value) || ""); setSaved(false); }}
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

        {/* Кнопки */}
        <button
          onClick={handleSave}
          disabled={!selectedGroupId || saving}
          className="w-full py-3 rounded-xl text-base font-semibold text-white transition-opacity disabled:opacity-40 mb-3"
          style={{ background: "var(--primary)" }}
        >
          {saving ? "Сохраняем..." : saved ? "Сохранено ✓" : "Сохранить"}
        </button>

        {selectedGroupId && (
          <button
            onClick={handleGoToSchedule}
            className="w-full py-3 rounded-xl text-base font-medium transition-colors"
            style={{ border: "0.5px solid var(--border)", color: "var(--muted)", background: "var(--card)" }}
          >
            Перейти к расписанию
          </button>
        )}

        {/* Синхронизация — внизу, без лишнего */}
        <div className="mt-8 pt-6" style={{ borderTop: "0.5px solid var(--border)" }}>
          <p className="text-xs text-center mb-3" style={{ color: "var(--muted)" }}>
            Расписание автоматически обновляется каждые 2 часа с msu.tj
          </p>
          <SyncButton />
        </div>

      </main>
    </div>
  );
}

function SyncButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    const secret = process.env.NEXT_PUBLIC_ADMIN_SECRET ?? "";
    if (!secret) return;
    setRunning(true);
    setResult(null);
    try {
      const data = await api.syncNow(true, secret);
      const msgs = data.results?.map((r: { faculty: string; status: string; lessons?: number }) =>
        `${r.faculty}: ${r.status}${r.lessons ? ` (${r.lessons} пар)` : ""}`
      ).join(" · ");
      setResult("Готово: " + msgs);
    } catch {
      setResult("Ошибка синхронизации");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="text-center">
      <button
        onClick={run}
        disabled={running}
        className="px-5 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
        style={{ border: "0.5px solid var(--border)", color: "var(--muted)", background: "var(--card)" }}
      >
        {running ? "Синхронизация..." : "Обновить вручную"}
      </button>
      {result && <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>{result}</p>}
    </div>
  );
}
