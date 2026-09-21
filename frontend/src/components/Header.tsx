"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { viewTransitionNavClick } from "@/lib/viewTransition";
import { api } from "@/lib/api";

const CHANGES_LAST_SEEN_KEY = "changes_last_seen";

const nav = [
  { href: "/", label: "Расписание" },
  { href: "/teachers", label: "Преподаватели" },
  { href: "/rooms", label: "Аудитории" },
  { href: "/changes", label: "Изменения" },
  { href: "/profile", label: "Мой кабинет" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();

  // Бейдж «есть новые изменения»: сверяем время последнего изменения своей
  // группы с локальной меткой «последний раз смотрел». Отметку о просмотре
  // ставит сама страница /changes при загрузке — здесь только чтение.
  //
  // Пересчитываем на каждом переходе, а не один раз. Шапка живёт в общем
  // макете и при переходах между страницами не пересоздаётся: раньше точка,
  // загоревшись, висела до полной перезагрузки страницы — человек заходил в
  // «Изменения», всё прочитывал, а она оставалась. Заход на саму страницу
  // гасит её сразу, не дожидаясь ответа сервера.
  const [hasNewChanges, setHasNewChanges] = useState(false);
  // Иконка приложения в полный размер — по клику на лого в шапке
  const [logoOpen, setLogoOpen] = useState(false);
  useEffect(() => {
    if (!logoOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLogoOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logoOpen]);
  useEffect(() => {
    if (pathname === "/changes") {
      setHasNewChanges(false);
      return;
    }
    const savedGroup = localStorage.getItem("selected_group_id");
    const groupId = savedGroup ? Number(savedGroup) : undefined;
    api.getChanges(groupId)
      .then(changes => {
        const latest = changes[0]?.detected_at;
        if (!latest) return;
        const lastSeen = localStorage.getItem(CHANGES_LAST_SEEN_KEY);
        setHasNewChanges(!lastSeen || new Date(latest) > new Date(lastSeen));
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 bg-[var(--background)] border-b border-[var(--border)] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex items-center h-14 lg:h-16 gap-4 lg:gap-6">
          {/* Лого. Сама иконка — кнопка: открывает её в полном размере
              (её часто хотят рассмотреть перед установкой приложения).
              Название рядом осталось ссылкой на главную, чтобы способ
              вернуться домой из шапки никуда не делся. */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLogoOpen(true)}
              aria-label="Посмотреть иконку приложения"
              className="shrink-0 rounded-lg transition-all active:scale-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- маленький статичный логотип, next/image тут избыточен */}
              <img src="/logo.png" alt="Иконка приложения" className="w-8 h-8 lg:w-10 lg:h-10 block" />
            </button>
            <Link href="/" onClick={viewTransitionNavClick(router, "/")} className="hidden sm:block">
              <span className="font-bold text-sm lg:text-base">МГУ Душанбе</span>
              <span className="hidden lg:block text-xs text-[var(--muted)]">Расписание занятий</span>
            </Link>
          </div>

          {/* Навигация — только на десктопе */}
          <nav className="hidden lg:flex items-center gap-1 lg:gap-2 flex-1">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={viewTransitionNavClick(router, href)}
                className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-sm lg:text-base whitespace-nowrap transition-colors font-medium ${
                  pathname === href
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--tag-bg)]"
                }`}
              >
                {label}
                {href === "/changes" && hasNewChanges && (
                  <span className="badge-pop inline-block w-1.5 h-1.5 rounded-full ml-1.5 align-middle" style={{ background: "#f43f5e" }} />
                )}
              </Link>
            ))}
          </nav>
          {/* На мобиле — пустое место для выравнивания */}
          <div className="flex-1 lg:hidden" />

          {/* На кабинете уже есть полная настройка темы (ThemeSetting) —
              не дублируем её иконкой здесь же на той же странице. */}
          {pathname !== "/profile" && <ThemeToggle />}
        </div>
      </div>

      {/* Иконка в полный размер. Через портал в <body>: сама шапка — sticky
          с z-50 и создаёт свой слой, поэтому оверлей, оставленный внутри неё,
          не смог бы её же и затемнить. Клик мимо картинки или Escape — закрыть. */}
      {logoOpen && createPortal(
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 p-6 bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-label="Иконка приложения"
          onClick={() => setLogoOpen(false)}
        >
          {/* Тот же файл, что и в шапке. icon-512.png — это другой кадр той же
              картинки (здание целиком, с отступами), и при клике казалось, что
              открывается чужая иконка. Показываем в нативные 256px, без
              растягивания — иначе мылит. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- статичный файл иконки, next/image тут не нужен */}
          <img
            src="/logo.png"
            alt="Иконка приложения «МГУ Душанбе — Расписание занятий»"
            className="anim-rise w-full max-w-[256px] aspect-square object-contain shadow-2xl rounded-full"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLogoOpen(false)}
            className="px-5 h-11 rounded-full text-sm font-semibold text-white border border-white/30 transition-all active:scale-95 hover:bg-white/10"
          >
            Закрыть
          </button>
        </div>,
        document.body,
      )}
    </header>
  );
}
