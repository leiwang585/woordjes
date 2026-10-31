const CACHE = 'woordjes-v8';
const SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-180.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    // Audio uses range requests; let the browser's HTTP cache handle it directly.
    if (url.pathname === '/api/tts') return;

    if (url.pathname.startsWith('/api/')) {
        // Network first so data is fresh; cached copy lets you study offline.
        event.respondWith(
            fetch(request)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE).then((c) => c.put(request, copy));
                    }
                    return res;
                })
                .catch(() => caches.match(request).then((r) => r || new Response(
                    JSON.stringify({ detail: 'You are offline' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                )))
        );
        return;
    }

    // App shell: stale-while-revalidate.
    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE).then((c) => c.put(request, copy));
                    }
                    return res;
                })
                .catch(() => cached || caches.match('/index.html'));
            return cached || network;
        })
    );
});
