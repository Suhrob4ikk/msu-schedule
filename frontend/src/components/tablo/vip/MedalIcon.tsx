/** Значки медалей «золотого профиля» — в Кабинете и в баннере «Новое достижение». */
import type { ReactNode } from "react";
import type { MedalIcon } from "@/lib/vipProgress";

const MI: Record<MedalIcon | "lock" | "trophy", ReactNode> = {
  flame: <path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-9z" fill="currentColor" />,
  cal: <g fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></g>,
  sun: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></g>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" />,
  gem: <path d="M6 3h12l4 6-10 12L2 9zM2 9h20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  map: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></g>,
  book: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></g>,
  key: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></g>,
  trophy: <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8" /></g>,
  lock: <g fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></g>,
};
export const MIcon = ({ name }: { name: MedalIcon | "lock" | "trophy" }) => <svg viewBox="0 0 24 24" aria-hidden="true">{MI[name]}</svg>;

