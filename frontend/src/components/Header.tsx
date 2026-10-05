"use client";
/**
 * Верхняя панель «Табло» (ТЗ сайта, раздел 2в): знак МГУ и «МГУ Душанбе»
 * (ведёт на главную), вкладки, чип «обновлено», колокольчик, аватар.
 *
 * - от 1024 px: пять вкладок, включая «Изменения» и «Сравнение»;
 * - 640–1023: четыре вкладки («Сравнение» — в меню аватара), короче подписи;
 * - до 640: только знак, статус и колокольчик — вкладки внизу (BottomNav).
 *   Вкладка «Расписание» на телефоне рисует свою шапку, как в приложении
 *   (phone={false}).
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { viewTransitionNavClick } from "@/lib/viewTransition";
import StatusChip from "./tablo/StatusChip";
import Bell from "./tablo/Bell";
import AvatarMenu from "./tablo/AvatarMenu";

const TABS = [
  { href: "/", label: "Расписание", short: "Расписание" },
  { href: "/teachers", label: "Педагоги", short: "Педагоги" },
  { href: "/rooms", label: "Аудитории", short: "Ауд." },
  { href: "/changes", label: "Изменения", short: "Изменения" },
  { href: "/compare", label: "Сравнение", short: "Сравнение", wideOnly: true },
];

export default function Header({ phone = true }: { phone?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className={`t-top ${phone ? "" : "max-sm:hidden"}`}>
      <div className="t-top-in">
        <Link href="/" onClick={viewTransitionNavClick(router, "/")} className="t-logo" aria-label="МГУ Душанбе — расписание своей группы">
          {/* eslint-disable-next-line @next/next/no-img-element -- маленький статичный знак, next/image тут избыточен */}
          <img src="/logo.png" alt="" width={38} height={38} />
          <span className="t-logo-name">МГУ Душанбе</span>
        </Link>

        <nav className="t-tabs" aria-label="Разделы">
          {TABS.map(t => {
            const active = t.href === "/" ? pathname === "/" : pathname?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                onClick={viewTransitionNavClick(router, t.href)}
                aria-current={active ? "page" : undefined}
                className={`t-tab ${active ? "t-tab-on" : ""} ${t.wideOnly ? "max-lg:hidden" : ""}`}
              >
                <span className="max-lg:hidden">{t.label}</span>
                <span className="lg:hidden">{t.short}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />
        <span className="max-lg:hidden"><StatusChip /></span>
        <span className="lg:hidden"><StatusChip compact /></span>
        <Bell />
        <span className="max-sm:hidden"><AvatarMenu /></span>
      </div>
    </header>
  );
}
