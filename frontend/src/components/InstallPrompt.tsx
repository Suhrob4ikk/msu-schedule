"use client";
import { useState, useEffect } from "react";

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as any);
      // Показываем через 4 секунды — не сразу, чтобы не мешать
      setTimeout(() => setVisible(true), 4000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setVisible(false);
    setPrompt(null);
  };

  if (!visible || !prompt) return null;

  return (
    <div className="fixed bottom-24 lg:bottom-6 left-4 right-4 z-[300] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[var(--primary)] text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 max-w-sm mx-auto">
        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-sm font-bold">
          МГУ
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">Установить приложение</p>
          <p className="text-xs opacity-75 mt-0.5">Иконка на рабочем столе · офлайн режим</p>
        </div>
        <button
          onClick={install}
          className="px-3 py-1.5 rounded-xl bg-white text-[var(--primary)] text-sm font-bold shrink-0 hover:bg-blue-50 transition-colors"
        >
          Установить
        </button>
        <button onClick={() => setVisible(false)} className="text-white/50 hover:text-white shrink-0 text-lg leading-none">
          ×
        </button>
      </div>
    </div>
  );
}
