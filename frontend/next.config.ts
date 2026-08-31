import type { NextConfig } from "next";

// Куда прокси отправляет запросы. Меняется только для локальной разработки
// (BACKEND_ORIGIN=http://127.0.0.1:8000), в проде всегда Render.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "https://msu-schedule.onrender.com";

const nextConfig: NextConfig = {
  env: {
    // Единственное место в вебе, где задан адрес бэкенда.
    // lib/api.ts и app/dev/page.tsx берут его из process.env.NEXT_PUBLIC_API_URL,
    // который Next.js прокидывает в клиентский бандл через это поле.
    //
    // Путь, а не полный URL, и это принципиально. Megafon TJ (мобильный
    // интернет) молча роняет пакеты до IP-диапазона Render 216.24.57.0/24:
    // с телефона по мобильной сети не открывается ни msu-schedule.onrender.com,
    // ни голый IP 216.24.57.7, ни любой чужой сервис на onrender.com — везде
    // таймаут, через VPN всё работает. Ретраями это не лечится (пробовали в
    // v1.9.18 и v1.9.19): пакеты просто не доходят.
    //
    // Поэтому браузер и приложение больше не ходят на Render напрямую. Они
    // ходят на этот же домен (Vercel, другой диапазон IP, Megafon его пускает),
    // а до Render достукивается уже Vercel — со своей стороны, где блокировки нет.
    //
    // Значение зашито литералом, а не берётся из окружения: переменная
    // NEXT_PUBLIC_API_URL со старым адресом Render, случайно оставшаяся в
    // настройках проекта на Vercel, снова сломала бы мобильный интернет.
    NEXT_PUBLIC_API_URL: "/backend",
  },
  async rewrites() {
    return [
      // /health лежит в корне бэкенда, а не под /api — но у него есть алиас
      // /api/health (backend/app/main.py), так что отдельного правила не нужно.
      { source: "/backend/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
    ];
  },
  // Заголовки для PWA и CORS
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
