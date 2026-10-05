"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getInstallEvent, onInstallChange, runInstall, isIOS, isStandalone } from "@/lib/install";

export default function InstallPrompt() {
  const pathname = usePathname();
  const [hasPrompt, setHasPrompt] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ios = !isStandalone() && isIOS();
    setShowIOS(ios);

    const dismissed = localStorage.getItem("pwa_install_dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    if (ios) {
      const timer = window.setTimeout(() => setVisible(true), 15000);
      return () => window.clearTimeout(timer);
    }

    // Событие установки ловит lib/install.ts — его же использует меню аватара
    let timer: number | undefined;
    const sync = () => {
      const has = !!getInstallEvent();
      setHasPrompt(has);
      if (has && timer === undefined) timer = window.setTimeout(() => setVisible(true), 15000);
      if (!has) setVisible(false);
    };
    sync();
    const off = onInstallChange(sync);
    return () => { off(); window.clearTimeout(timer); };
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("pwa_install_dismissed", String(Date.now()));
  };

  if (!visible || pathname?.startsWith("/dev")) return null;

  // Инструкция для iOS: "Поделиться → На экран Домой"
  if (showIOS) {
    return (
      <div className="fixed bottom-24 sm:bottom-6 left-4 right-4 z-[300] anim-slide-up">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-2xl max-w-sm mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--primary)] flex items-center justify-center shrink-0 text-[var(--on-fill)] text-xs font-bold">
              МГУ
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">Установить на iPhone</p>
              <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                Нажмите{" "}
                {/* Иконка "Поделиться" из Safari */}
                <svg className="inline w-4 h-4 mb-0.5 text-[var(--ink)]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 8.586V3a1 1 0 011-1z" />
                  <path d="M3 10a1 1 0 011-1h1a1 1 0 010 2H5v5h10v-5h-1a1 1 0 010-2h1a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2z" />
                </svg>{" "}
                внизу браузера, затем{" "}
                <strong>«На экран «Домой»»</strong>
              </p>
            </div>
            {/* Минимум 44×44px для touch-цели */}
            <button
              onClick={dismiss}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--tag-bg)] transition-colors shrink-0 text-xl"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Android / Chrome: нативный prompt
  if (hasPrompt) {
    return (
      <div className="fixed bottom-24 sm:bottom-6 left-4 right-4 z-[300] anim-slide-up">
        <div className="bg-[var(--primary)] text-[var(--on-fill)] rounded-2xl p-4 shadow-2xl flex items-center gap-3 max-w-sm mx-auto">
          <div className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center shrink-0 text-sm font-bold">
            МГУ
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">Установить приложение</p>
            <p className="text-xs opacity-75 mt-0.5">Иконка на экране · офлайн режим</p>
          </div>
          <button
            onClick={async () => {
              if (await runInstall()) dismiss();
              setVisible(false);
            }}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--surface)] text-[var(--ink)] text-sm font-bold shrink-0 hover:opacity-90 transition-colors"
          >
            Установить
          </button>
          <button
            onClick={dismiss}
            className="w-11 h-11 flex items-center justify-center opacity-70 hover:opacity-100 shrink-0 text-xl"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return null;
}
