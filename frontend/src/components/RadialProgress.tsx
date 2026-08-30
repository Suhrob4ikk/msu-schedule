"use client";

/**
 * Круглый индикатор прогресса — тающее кольцо (как таймер варки яйца).
 * Заменяет тонкую линейную полоску там, где прогресс — это время: пара
 * идёт / перемена тикает. Прогресс плавно анимируется через CSS-переход
 * stroke-dashoffset, а не пересчётом кадров.
 */
export default function RadialProgress({
  progress,
  size = 40,
  stroke = 4,
  color = "var(--primary)",
  track = "var(--tag-bg)",
  children,
}: {
  progress: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // NaN/Infinity (например, если время пары пришло битым) превратили бы
  // stroke-dashoffset в мусор и кольцо просто исчезло бы. Считаем такое нулём.
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const offset = c * (1 - p);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {children && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
