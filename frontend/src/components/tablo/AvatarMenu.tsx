"use client";
/**
 * Кружок с первой буквой имени: имя и группа, «Кабинет», «Сменить группу»,
 * тема (Авто · Светлая · Тёмная · Чёрная) прямо в меню, «Установить как
 * приложение». На экранах уже 1024 сюда же переезжает «Сравнение».
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { shortGroupName } from "@/lib/api";
import { BACKGROUND_NAMES, saveAppearance, type Background } from "@/lib/appearance";
import { getInstallEvent, onInstallChange, runInstall, isIOS, isStandalone } from "@/lib/install";
import { useAppearance, useMe } from "@/lib/tablo/hooks";
import Icon from "./Icon";
import { Popover } from "./Overlay";

const BGS: Background[] = ["system", "light", "dark", "black"];

export function ThemeSegment() {
  const a = useAppearance();
  return (
    <div className="t-seg" role="radiogroup" aria-label="Тема">
      {BGS.map(bg => {
        const on = a?.background === bg;
        return (
          <button key={bg} type="button" role="radio" aria-checked={on}
            className={`t-seg-btn ${on ? "t-seg-on" : ""}`}
            onClick={() => a && saveAppearance({ ...a, background: bg })}>
            {BACKGROUND_NAMES[bg]}
          </button>
        );
      })}
    </div>
  );
}

export default function AvatarMenu() {
  const me = useMe();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [canInstall, setCanInstall] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  useEffect(() => {
    const sync = () => setCanInstall(!!getInstallEvent());
    sync();
    setIosHint(isIOS() && !isStandalone());
    return onInstallChange(sync);
  }, []);

  const letter = me?.name.trim().charAt(0).toUpperCase() || null;
  const groupLabel = me?.group ? `${shortGroupName(me.group.name)} · ${me.group.year} курс` : null;

  return (
    <>
      <button type="button" onClick={e => { setAnchor(e.currentTarget); setOpen(o => !o); }} aria-expanded={open}
        aria-label="Кабинет и настройки" className="t-avatar">
        {letter ?? <Icon name="user" size={22} />}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={close} width={360} align="end" label="Кабинет и настройки">
          <div className="t-panel p-3">
            <div className="flex items-center gap-3 px-2 pt-1 pb-3 border-b border-[var(--line)]">
              <span className="t-avatar t-avatar-lg" aria-hidden="true">{letter ?? <Icon name="user" size={26} />}</span>
              <div className="min-w-0">
                <p className="text-[19px] font-bold leading-tight truncate">{me?.name.trim() || "Без имени"}</p>
                {groupLabel && <p className="text-[15px] text-[var(--text-2)]">{groupLabel}</p>}
              </div>
            </div>
            <nav className="py-1.5">
              <Link href="/profile" onClick={close} className="t-menu-item"><Icon name="user" />Кабинет</Link>
              <Link href="/profile?edit=1" onClick={close} className="t-menu-item"><Icon name="users" />Сменить группу</Link>
              <Link href="/compare" onClick={close} className="t-menu-item lg:hidden"><Icon name="swap" />Сравнение</Link>
            </nav>
            <p className="px-2 pt-1 pb-2 text-[14px] text-[var(--text-2)]">Тема</p>
            <ThemeSegment />
            {(canInstall || iosHint) && (
              <div className="mt-2 pt-1.5 border-t border-[var(--line)]">
                {canInstall ? (
                  <button type="button" className="t-menu-item w-full" onClick={() => { close(); void runInstall(); }}>
                    <Icon name="download" />Установить как приложение
                  </button>
                ) : (
                  <p className="t-menu-item cursor-default">
                    <Icon name="download" />
                    <span>Установить: «Поделиться» → «На экран «Домой»»</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
