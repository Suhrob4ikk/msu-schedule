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

  // Компактная плашка внизу, над нижними вкладками (просьба владельца, окт 2026)
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="t-install anim-slide-up" role="dialog" aria-label="Установить приложение">
      {/* eslint-disable-next-line @next/next/no-img-element -- маленький статичный знак */}
      <img src="/logo.png" alt="" width={32} height={32} />
      {children}
      <button type="button" onClick={dismiss} className="t-install-x" aria-label="Закрыть">×</button>
    </div>
  );

  // Инструкция для iOS: "Поделиться → На экран Домой"
  if (showIOS) {
    return (
      <Shell>
        <p className="t-install-text">
          Установить: нажмите{" "}
          <svg className="inline w-4 h-4 -mt-0.5 text-[var(--ink)]" fill="currentColor" viewBox="0 0 20 20" aria-label="«Поделиться»">
            <path d="M10 2a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 8.586V3a1 1 0 011-1z" />
            <path d="M3 10a1 1 0 011-1h1a1 1 0 010 2H5v5h10v-5h-1a1 1 0 010-2h1a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2z" />
          </svg>{" "}
          → «На экран «Домой»»
        </p>
      </Shell>
    );
  }

  // Android / Chrome: нативный prompt
  if (hasPrompt) {
    return (
      <Shell>
        <p className="t-install-text">Установить как приложение</p>
        <button
          type="button"
          onClick={async () => {
            if (await runInstall()) dismiss();
            setVisible(false);
          }}
          className="t-install-go"
        >
          Установить
        </button>
      </Shell>
    );
  }

  return null;
}
