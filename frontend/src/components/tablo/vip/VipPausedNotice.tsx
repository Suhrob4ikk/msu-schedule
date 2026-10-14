"use client";
/**
 * Особый профиль временно выключен (paused в lib/special.ts; решение владельца, 14 окт 2026).
 * Человек видит обычный сайт; один раз — окно «Особый профиль временно отключён… напишите
 * разработчику» с единственной кнопкой «Написать разработчику» (владелец: «Понятно» не нужно;
 * мимо окна оно не закрывается). В поле переписки уже стоит «Почему отключили…» (DRAFTS). Металл (золото, бриллиант, платина) без
 * профиля смотрелся бы просто жёлтым или серым цветом — меняем его на обычный синий, а сам
 * металл запоминаем (VIP_PAUSED_BACKUP_KEY). Профиль включили обратно — металл возвращается.
 * Тексты — «от администрации», без романтики (решение владельца).
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readAppearance, saveAppearance } from "@/lib/appearance";
import { METALS, VIP_PAUSED_BACKUP_KEY, VIP_PAUSED_NOTICE_KEY, metalOf, readPausedVip, readVip, type MetalId } from "@/lib/special";

export default function VipPausedNotice() {
  const path = usePathname();
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const backup = localStorage.getItem(VIP_PAUSED_BACKUP_KEY) as MetalId | null;
      if (readVip()) {
        // профиль снова включён — вернуть металл, который был
        if (backup && METALS[backup]) {
          const a = readAppearance();
          if (a.accent.preset === "blue") saveAppearance({ ...a, accent: { preset: "custom", custom: METALS[backup].hex } });
          localStorage.removeItem(VIP_PAUSED_BACKUP_KEY);
        }
        return;
      }
      if (!readPausedVip()) return;
      const a = readAppearance();
      const metal = metalOf(a);
      if (metal) {
        localStorage.setItem(VIP_PAUSED_BACKUP_KEY, metal);
        saveAppearance({ ...a, accent: { preset: "blue", custom: null } });
      }
      if (!localStorage.getItem(VIP_PAUSED_NOTICE_KEY)) setShow(true);
    } catch { /* приватный режим */ }
  }, []);

  const done = () => {
    try { localStorage.setItem(VIP_PAUSED_NOTICE_KEY, "1"); } catch { /* приватный режим */ }
    setShow(false);
    router.push("/profile/messages?draft=vip-paused");
  };

  if (!show || path?.startsWith("/dev")) return null;
  return (
    <div className="t-notice-scrim">
      <div className="t-notice" role="dialog" aria-modal="true" aria-labelledby="vip-paused-title">
        <small>Уведомление от администрации</small>
        <h2 id="vip-paused-title">Особый профиль временно отключён</h2>
        <p>Сейчас сайт выглядит как у всех. Ваши достижения и серия сохранены.</p>
        <p>Если у вас есть какие-то вопросы — напишите разработчику.</p>
        <div className="t-notice-btns">
          <button type="button" className="t-btn-fill" onClick={done}>Написать разработчику</button>
        </div>
      </div>
    </div>
  );
}
