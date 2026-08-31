"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Ссылка на Android-приложение в кабинете + раскрывающийся список того, что
 * в нём есть сверх сайта.
 *
 * Адрес APK не зашит: его отдаёт бэкенд (`/app/version`), а тот читает
 * последний релиз с GitHub. Выложили новый релиз — ссылка обновилась сама,
 * править тут ничего не нужно.
 *
 * На iPhone карточку не показываем: приложение только под Android, и
 * предлагать его владельцу айфона — впустую тратить его время.
 */
export default function AppDownloadCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return;

    api.getAppVersion()
      .then(info => {
        if (!info.download_url) return;
        setUrl(info.download_url);
        setVersion(info.version);
      })
      .catch(() => { /* нет связи — просто не показываем карточку */ });
  }, []);

  if (!url) return null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <a
        href={url}
        className="flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors hover:text-[var(--primary)]"
        style={{ color: "var(--muted)" }}
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        <span className="flex-1 text-left">Скачать приложение для Android</span>
        {version && (
          <span className="text-xs shrink-0" style={{ opacity: 0.7 }}>v{version}</span>
        )}
      </a>

      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs border-t transition-colors hover:text-[var(--primary)]"
        style={{ color: "var(--muted)", borderColor: "var(--border)" }}
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        Чем приложение удобнее сайта
      </button>

      {open && (
        <div
          className="px-3 pb-3 pt-1 text-xs leading-relaxed flex flex-col gap-2.5"
          style={{ color: "var(--muted)" }}
        >
          <p>
            <b style={{ color: "var(--foreground)" }}>Виджет на главном экране.</b>{" "}
            Следующая пара видна сразу, ничего открывать не нужно.
          </p>
          <p>
            <b style={{ color: "var(--foreground)" }}>Строка «идёт пара» в шторке.</b>{" "}
            Предмет, аудитория и отсчёт до конца пары — не разблокируя телефон.
            Включается по желанию, по умолчанию выключено.
          </p>
          <p>
            <b style={{ color: "var(--foreground)" }}>Напоминания ставит сам телефон.</b>{" "}
            О зачётах и перед парой. Работают без интернета. Сайт умеет присылать
            уведомления только через браузер — а его Android нередко выгружает из
            памяти, и уведомление не приходит.
          </p>
          <p>
            <b style={{ color: "var(--foreground)" }}>Полностью работает офлайн.</b>{" "}
            Расписание всех групп скачивается на телефон целиком, а не подгружается
            по кусочкам.
          </p>
          <p>
            <b style={{ color: "var(--foreground)" }}>Открывается мгновенно</b> — не ждёт
            запуска браузера и ответа сети.
          </p>
        </div>
      )}
    </div>
  );
}
