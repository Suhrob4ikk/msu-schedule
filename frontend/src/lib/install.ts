"use client";
/**
 * «Установить как приложение»: событие beforeinstallprompt браузер присылает
 * один раз, а нужно оно двум местам — плашке InstallPrompt и пункту в меню
 * аватара. Поэтому ловим его здесь, в одном месте, и раздаём подписчикам.
 */

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach(fn => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach(fn => fn());
  });
}

export const getInstallEvent = () => deferred;

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Показать системный запрос установки. true — человек согласился. */
export async function runInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  deferred = null;
  listeners.forEach(fn => fn());
  return outcome === "accepted";
}

export function isIOS(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as { standalone?: boolean }).standalone === true
    || window.matchMedia("(display-mode: standalone)").matches;
}
