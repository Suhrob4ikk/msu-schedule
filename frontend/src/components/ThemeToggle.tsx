"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  // mounted=false на сервере и при первом клиентском рендере → иконка совпадает
  // с SSR (светлая). После монтирования читаем реальную тему. Иначе hydration #418.
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(saved === "dark" || (!saved && prefersDark));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) document.documentElement.classList.toggle("dark", dark);
  }, [dark, mounted]);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      className="p-2.5 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--tag-bg)] transition-colors"
      title={dark ? "Светлая тема" : "Тёмная тема"}
      aria-label="Переключить тему"
    >
      {mounted && dark ? (
        <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 1.78a1 1 0 011.42 1.42l-.71.7a1 1 0 11-1.41-1.41l.7-.71zM18 9a1 1 0 110 2h-1a1 1 0 110-2h1zM5.78 3.78a1 1 0 00-1.42 1.42l.71.7A1 1 0 106.49 4.49l-.71-.71zM4 10a1 1 0 01-1 1H2a1 1 0 110-2h1a1 1 0 011 1zm.93 5.07a1 1 0 001.41 1.41l.71-.7a1 1 0 00-1.41-1.42l-.71.71zM10 17a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm5.07-.93a1 1 0 001.41-1.41l-.7-.71a1 1 0 00-1.42 1.41l.71.71zM10 6a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}
