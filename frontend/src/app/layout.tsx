import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import InstallPrompt from "@/components/InstallPrompt";

// Бэкенд живёт на другом домене (Render). Без preconnect браузер начинает
// DNS + TLS только в момент первого fetch — это 100-300 мс сверху на самом
// важном запросе. Здесь он открывает соединение параллельно с загрузкой HTML.
const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "https://msu-schedule.onrender.com/api").origin;
  } catch {
    return "";
  }
})();

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e9b72" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
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
        {API_ORIGIN && (
          <>
            <link rel="preconnect" href={API_ORIGIN} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={API_ORIGIN} />
          </>
        )}
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
