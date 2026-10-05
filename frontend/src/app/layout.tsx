import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "./tablo.css";
import "./tablo-teachers.css";
import BottomNav from "@/components/BottomNav";
import ServerResync from "@/components/ServerResync";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import InstallPrompt from "@/components/InstallPrompt";
import AppearanceSync from "@/components/AppearanceSync";
import { appearanceInitScript, MODE_BASE } from "@/lib/appearance";

// Раньше здесь был <link rel="preconnect"> на домен Render: бэкенд жил на
// другом домене, и без preconnect браузер начинал DNS + TLS только в момент
// первого fetch. Теперь API отдаётся с этого же домена через прокси
// (/backend/* → Render, см. next.config.ts) — соединение уже открыто, тем же,
// которым загрузилась страница, и preconnect стал не нужен.

// Onest — шрифт «Табло», как в приложении. next/font кладёт файлы на этот же
// сайт (/_next/static/media), а service worker держит их в кэше, так что
// шрифт есть и офлайн, и в установленном приложении.
const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

export const metadata: Metadata = {
  title: "МГУ Душанбе — Расписание занятий",
  description: "Расписание занятий МГУ филиал в городе Душанбе. Просмотр, уведомления, экспорт в Google Calendar.",
  manifest: "/manifest.json",
  keywords: ["МГУ", "Душанбе", "расписание", "занятия", "msu.tj"],
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "МГУ Душанбе — Расписание занятий",
    description: "Расписание занятий МГУ филиал в городе Душанбе",
    type: "website",
  },
};

export const viewport: Viewport = {
  // Цвет системной панели браузера — фон страницы. Точный цвет выбранной
  // темы (в т. ч. «Чёрной») ставит applyAppearance после загрузки.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: MODE_BASE.light.bg },
    { media: "(prefers-color-scheme: dark)", color: MODE_BASE.dark.bg },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="h-full" suppressHydrationWarning>
      <head>
        {/* Тема и акцент — до первой отрисовки, чтобы не мигало (lib/appearance.ts).
            next/script с beforeInteractive, а не голый <script>: React 19 в dev
            ругается на сырой <script> внутри дерева компонентов. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: appearanceInitScript() }}
        />
      </head>
      <body className={`${onest.variable} min-h-full flex flex-col antialiased`}>
        {children}
        <BottomNav />
        <InstallPrompt />
        <ServiceWorkerRegister />
        <ServerResync />
        <AppearanceSync />
      </body>
    </html>
  );
}
