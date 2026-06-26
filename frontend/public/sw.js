// Версия кеша — меняй при каждом деплое если нужно принудительно сбросить
const CACHE_STATIC = 'msu-static-v2';
const CACHE_API    = 'msu-api-v2';

// Страницы и ассеты для предварительного кеширования при установке
const PRECACHE_URLS = [
  '/',
  '/teachers',
  '/rooms',
  '/changes',
  '/profile',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html',
];

// ─── Установка ───────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => c.addAll(PRECACHE_URLS).catch(() => {
        // Если какой-то URL недоступен — не блокируем установку
      }))
      .then(() => self.skipWaiting())
  );
});

// ─── Активация ───────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_API)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Перехват запросов ────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // 1. Next.js статика (/_next/static/) — хешированные файлы, никогда не меняются
  //    Стратегия: Cache First (кеш → сеть → кешируем)
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 2. API запросы (внешний домен Railway) — Network First с кеш-fallback
  const isApi = url.hostname !== self.location.hostname;
  if (isApi) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_API).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 3. Страницы приложения — Network First, при офлайне показываем кеш или /offline.html
  if (url.pathname.startsWith('/') && !url.pathname.includes('.')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(cached =>
            cached || caches.match('/offline.html')
          )
        )
    );
    return;
  }

  // 4. Всё остальное (иконки, шрифты, изображения) — Cache First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
