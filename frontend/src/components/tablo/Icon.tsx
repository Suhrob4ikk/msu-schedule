/** Иконки «Табло» — линейные, толщина 1,8, цвет currentColor. */
const PATHS: Record<string, React.ReactNode> = {
  calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></>,
  users: <><path d="M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20" /><circle cx="10" cy="8" r="3.5" /><path d="M20 20v-1.5a3.5 3.5 0 00-2.5-3.35M15 4.65a3.5 3.5 0 010 6.7" /></>,
  door: <><path d="M5 21V4.5A1.5 1.5 0 016.5 3h11A1.5 1.5 0 0119 4.5V21" /><path d="M3 21h18M14.5 12.5v.01" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" /></>,
  bell: <><path d="M6 9a6 6 0 1112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" /><path d="M10 20a2.2 2.2 0 004 0" /></>,
  share: <><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8.5 9" /></>,
  link: <><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" /></>,
  print: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  calendarPlus: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18M12 13v5M9.5 15.5h5" /></>,
  download: <><path d="M12 3v12M7.5 10.5L12 15l4.5-4.5" /><path d="M4 19h16" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  note: <><path d="M14.5 4.5l5 5L9 20H4v-5z" /></>,
  swap: <><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>,
  history: <><path d="M3 12a9 9 0 103-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  palette: <><path d="M12 3a9 9 0 000 18c1.3 0 2-.9 2-2 0-1.4 1-2.2 2.3-2.2H18a3 3 0 003-3C21 7.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1.2" /><circle cx="10.5" cy="7" r="1.2" /><circle cx="15" cy="7.5" r="1.2" /></>,
  wifiOff: <><path d="M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 014.4-2.4M12.6 9.8A10 10 0 0119 12.5M2 8.8a15 15 0 015-2.9M10.7 5.1A15 15 0 0122 8.8M12 20h.01" /></>,
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20, className, strokeWidth = 1.8 }: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
