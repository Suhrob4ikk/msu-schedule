"use client";
/**
 * «Активировать профиль» внизу Кабинета: ввод персонального кода (lib/special.ts).
 * Верный код запоминается в браузере, и страница перезагружается — инлайн-скрипт
 * в layout.tsx включает шрифт и «золотой профиль» до первой отрисовки.
 */
import { useState } from "react";
import { Sheet } from "@/components/tablo/Overlay";
import { applyVipCode } from "@/lib/special";

export default function VipCodeEntry() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyVipCode(code)) { setErr(true); return; }
    window.location.href = "/";
  };

  return (
    <>
      <button type="button" className="t-pf-activate" onClick={() => setOpen(true)}>Активировать профиль</button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Активация профиля" title="Активация профиля">
          <form className="vip-sheet" onSubmit={submit}>
            <p className="vip-sheet-q">Введите персональный код, который вам выдал администратор.</p>
            <input
              className="t-pf-code" value={code} autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false}
              maxLength={16} placeholder="Персональный код" aria-label="Персональный код"
              onChange={e => { setCode(e.target.value); setErr(false); }}
            />
            {err && <p className="vip-err">Код не найден. Проверьте и попробуйте ещё раз.</p>}
            <button type="submit" className="t-btn-fill t-pf-code-go" disabled={!code.trim()}>Активировать</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
