"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const nav = [
  { href: "/", label: "Расписание" },
  { href: "/teachers", label: "Преподаватели" },
  { href: "/rooms", label: "Аудитории" },
  { href: "/changes", label: "Изменения" },
  { href: "/profile", label: "Мой кабинет" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-[var(--background)] border-b border-[var(--border)] shadow-sm">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center h-14 gap-4">
          {/* Лого */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
              <span className="text-white text-xs font-bold">МГУ</span>
            </div>
            <span className="font-semibold text-sm hidden sm:block">Душанбе</span>
          </Link>

          {/* Навигация */}
          <nav className="flex items-center gap-1 overflow-x-auto flex-1 scrollbar-none">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  pathname === href
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
