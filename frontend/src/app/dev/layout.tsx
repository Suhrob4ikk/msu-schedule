import type { Metadata } from "next";

// Панель не должна индексироваться и не связана ни с каким меню приложения.
export const metadata: Metadata = {
  title: "·",
  robots: { index: false, follow: false, nocache: true },
};

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
