"use client";
/**
 * Живое пламя серии (решение владельца, 11 окт 2026): три слоя колышутся вразнобой,
 * снизу свечение, вверх летят искорки. Цвета — токены выбранного металла (--gold-*),
 * у каждого экземпляра свои id градиентов, поэтому металл подхватывается правильно.
 */
import { useId } from "react";

export default function VipFlame({ size = 24, embers = true }: { size?: number; embers?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className="vip-flame" style={{ width: size, height: size * 1.25 }} aria-hidden="true">
      <span className="vip-flame-glow" />
      <svg viewBox="0 0 24 30">
        <defs>
          <linearGradient id={`fa${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="var(--gold-d)" /><stop offset=".6" stopColor="var(--gold)" /><stop offset="1" stopColor="var(--gold-l)" />
          </linearGradient>
          <linearGradient id={`fb${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="var(--gold)" /><stop offset="1" stopColor="var(--gold-xl)" />
          </linearGradient>
        </defs>
        <path className="vip-flame-1" fill={`url(#fa${id})`} d="M12 1c1.5 5 8 7.5 8 15.5A8 8 0 0 1 12 25a8 8 0 0 1-8-8.5c0-3.5 2-5.5 3.5-7 0 3 1.3 4.5 3 4.5C10.5 10 10 6 12 1z" />
        <path className="vip-flame-2" fill={`url(#fb${id})`} d="M12 9c1 3 4.5 5 4.5 9A4.5 4.5 0 0 1 12 22.5 4.5 4.5 0 0 1 7.5 18c0-2 1-3 2-4 0 1.5.8 2.5 1.8 2.5C11 14 11 12 12 9z" />
        <path className="vip-flame-3" fill="#fff" opacity=".85" d="M12 15c.6 1.6 2.2 2.6 2.2 4.4A2.2 2.2 0 0 1 12 21.6a2.2 2.2 0 0 1-2.2-2.2c0-1 .5-1.6 1-2 0 .8.4 1.2.9 1.2-.1-1.4-.1-2.4.3-3.6z" />
      </svg>
      {embers && [0, 1, 2].map(i => <i key={i} className="vip-ember" style={{ ["--ex" as string]: `${[-7, 5, 9][i]}px`, animationDelay: `${i * 0.6}s` }} />)}
    </span>
  );
}
