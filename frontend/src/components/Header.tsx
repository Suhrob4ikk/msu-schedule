"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const nav = [
  { href: "/", label: "Расписание" },
  { href: "/teachers", label: "Преподаватели" },
  { href: "/rooms", label: "Аудитории" },
  { href: "/profile", label: "Мой кабинет" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-[var(--background)] border-b border-[var(--border)] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex items-center h-14 lg:h-16 gap-4 lg:gap-6">
          {/* Лого */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-[var(--primary)] flex items-center justify-center">
              <span className="text-white text-xs lg:text-sm font-bold">МГУ</span>
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-sm lg:text-base">МГУ Душанбе</span>
              <span className="hidden lg:block text-xs text-[var(--muted)]">Расписание занятий</span>
            </div>
          </Link>

          {/* Навигация — только на десктопе */}
          <nav className="hidden lg:flex items-center gap-1 lg:gap-2 flex-1">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-sm lg:text-base whitespace-nowrap transition-colors font-medium ${
                  pathname === href
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--tag-bg)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          {/* На мобиле — пустое место для выравнивания */}
          <div className="flex-1 lg:hidden" />

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
