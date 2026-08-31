import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import InstallPrompt from "@/components/InstallPrompt";

// Раньше здесь был <link rel="preconnect"> на домен Render: бэкенд жил на
// другом домене, и без preconnect браузер начинал DNS + TLS только в момент
// первого fetch. Теперь API отдаётся с этого же домена через прокси
// (/backend/* → Render, см. next.config.ts) — соединение уже открыто, тем же,
// которым загрузилась страница, и preconnect стал не нужен.

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
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
  // Цвет системной панели браузера. Тёмное значение — тот же --background из
  // globals.css (#0b0d10); раньше здесь оставался сине-сланцевый #0f172a от
  // старой палитры, и панель браузера не совпадала с фоном страницы.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e9b72" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
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
        {/* Устанавливаем тему до рендера, чтобы избежать вспышки */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&d)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${manrope.variable} min-h-full flex flex-col antialiased`}>
        {children}
        <BottomNav />
        <InstallPrompt />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
