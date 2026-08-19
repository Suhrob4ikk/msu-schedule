"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

/**
 * QR-код + ссылка на сайт — самый быстрый способ позвать одногруппников.
 * Ведёт на сайт, а не на APK: с сайта ничего не нужно устанавливать и
 * разрешать «неизвестные источники», расписание открывается сразу.
 */
export default function InviteCard() {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // window недоступен на сервере — заполняем после монтирования (#418).
  useEffect(() => { setUrl(window.location.origin); }, []);

  if (!url) return null;

  const share = async () => {
    const text = "МГУ Душанбе — расписание занятий, свободные аудитории и изменения. Заходи:";
    try {
      if (navigator.share) {
        await navigator.share({ title: "МГУ Расписание", text, url });
        return;
      }
    } catch {
      return; // пользователь отменил шаринг — не страшно
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(url);
    }
  };

  return (
    <div
      className="w-full rounded-xl border px-4 py-4 flex flex-col items-center gap-3"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <p className="text-sm font-semibold self-start" style={{ color: "var(--foreground)" }}>
        Позвать одногруппников
      </p>
      <div className="p-3 rounded-lg" style={{ background: "#fff" }}>
        <QRCodeSVG value={url} size={140} fgColor="#111111" bgColor="#ffffff" />
      </div>
      <p className="text-xs text-center max-w-[240px]" style={{ color: "var(--muted)" }}>
        Пусть отсканируют камерой телефона — откроется сайт с расписанием, ничего устанавливать не нужно.
      </p>
      <button
        onClick={share}
        className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity"
        style={{ background: "var(--primary)" }}
      >
        {copied ? "Ссылка скопирована" : "Поделиться ссылкой"}
      </button>
    </div>
  );
}
