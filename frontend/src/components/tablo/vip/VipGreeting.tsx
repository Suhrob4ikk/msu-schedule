"use client";
/** Приветствие на «Расписании» для особых (lib/special.ts): «Добрый вечер, Шахзода». */

/** now — часы Душанбе (dushanbeNow), поэтому getHours() — местное время. */
export default function VipGreeting({ name, now }: { name: string; now: Date }) {
  const h = now.getHours();
  const hello = h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  return (
    <div className="vip-greet">
      {hello},<br />
      <span className="vip-gold-text">{name}</span>
    </div>
  );
}
