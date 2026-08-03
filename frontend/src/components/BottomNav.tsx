"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  {
    href: "/",
    label: "Расписание",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/teachers",
    label: "Педагоги",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    href: "/rooms",
    label: "Ауд.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Кабинет",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    setRegistered(!!localStorage.getItem("msu_device_id_v2"));
  }, []);

  // На панели разработчика своя верстка — нижняя навигация не нужна
  if (pathname?.startsWith("/dev")) return null;
  // Профиль — скрываем навбар только для новых пользователей (принудительная регистрация)
  if (pathname === "/profile" && !registered) return null;

  const activeIdx = nav.findIndex(n => n.href === pathname);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--background)] border-t border-[var(--border)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative flex">
        {/* Индикатор активной вкладки — один на всю панель, поэтому при
            переходе он ПЕРЕЕЗЖАЕТ, а не появляется на новом месте.
            Ширина = ровно одна вкладка, сдвиг = её номер. */}
        {activeIdx >= 0 && (
          <span
            className="absolute top-0 flex justify-center pointer-events-none transition-transform duration-300 ease-out"
            style={{
              width: `${100 / nav.length}%`,
              transform: `translateX(${activeIdx * 100}%)`,
            }}
            aria-hidden="true"
          >
            <span className="block w-8 h-0.5 rounded-full bg-[var(--primary)]" />
          </span>
        )}
        {nav.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors active:scale-95 ${active
                ? "text-[var(--primary)]"
                : "text-[var(--muted)]"
                }`}
            >
              {/* Класс перехода стоит всегда — иначе увеличение иконки
                  происходило бы скачком, без анимации */}
              <span className={`transition-transform duration-200 ${active ? "scale-110 -translate-y-px" : ""}`}>
                {icon}
              </span>
              <span className="text-[9px] font-medium leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
