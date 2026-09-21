import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Script from "next/script";
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
  // Цвет системной панели браузера. Значения — те же --background/--primary,
  // что и в globals.css, чтобы панель браузера совпадала с фоном страницы.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c13" },
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
        {/* Устанавливаем тему до рендера, чтобы избежать вспышки. next/script
            с beforeInteractive — вместо голого <script>, который React 19
            в dev ругает предупреждением "Encountered a script tag while
            rendering React component": сырой <script> реконсилируется как
            обычный узел дерева и не перевыполнится при повторном рендере,
            next/script правильно выносит его из реконсиляции. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var e=document.documentElement;var t=localStorage.getItem('theme');var isDark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(isDark){e.classList.add('dark');}if(localStorage.getItem('accent')==='green'){var v=isDark?{'--primary':'#0e9b72','--primary-strong':'#2dd4a7','--primary-soft':'#0e2a22','--ring':'rgba(27, 185, 139, 0.4)'}:{'--primary':'#0e9b72','--primary-strong':'#0c8763','--primary-soft':'#e5f4f0','--ring':'rgba(14, 155, 114, 0.35)'};for(var k in v){e.style.setProperty(k,v[k]);}}}catch(err){}})();`,
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
