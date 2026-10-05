"use client";
/**
 * Кружок с первой буквой имени в шапке — ссылка в Кабинет. Меню с темой,
 * «Сменить группу» и установкой убрано (окт 2026): всё это уже есть в
 * Кабинете («Изменить имя или группу», «Внешний вид», «Разделы»).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/tablo/hooks";
import Icon from "./Icon";

export default function AvatarMenu() {
  const me = useMe();
  const pathname = usePathname();
  const letter = me?.name.trim().charAt(0).toUpperCase() || null;
  return (
    <Link href="/profile" aria-label="Кабинет" aria-current={pathname === "/profile" ? "page" : undefined}
      className={`t-avatar ${pathname === "/profile" ? "t-avatar-on" : ""}`}>
      {letter ?? <Icon name="user" size={22} />}
    </Link>
  );
}
