import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "МГУ Душанбе — Расписание занятий",
  description: "Расписание занятий МГУ филиал в городе Душанбе. Просмотр, уведомления, экспорт в Google Calendar.",
  manifest: "/manifest.json",
  keywords: ["МГУ", "Душанбе", "расписание", "занятия", "msu.tj"],
  openGraph: {
    title: "МГУ Душанбе — Расписание занятий",
    description: "Расписание занятий МГУ филиал в городе Душанбе",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1d4ed8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
