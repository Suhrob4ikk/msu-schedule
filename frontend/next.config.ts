import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Единственное место в вебе, где зашит URL бэкенда по умолчанию.
    // lib/api.ts и app/dev/page.tsx берут его из process.env.NEXT_PUBLIC_API_URL,
    // который Next.js прокидывает и на сервер, и в клиентский бандл через это поле.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://msu-schedule.onrender.com/api",
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
