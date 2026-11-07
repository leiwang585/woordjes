const CACHE = 'woordjes-v22';
// Relative to this file, so the app works from any folder (e.g. GitHub Pages /repo-name/).
const SHELL = [
    './',
    'index.html',
    'styles.css',
    'store.js',
    'pictures.js',
    'app.js',
    'parser.js',
    'manifest.json',
    'demo/basic-100.json',
    'demo/verb-100.json',
    'icons/icon-180.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    // 'reload' skips the browser's HTTP cache (GitHub Pages allows 10 minutes), so updates get fresh files.
    const fresh = SHELL.map((url) => new Request(url, { cache: 'reload' }));
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Stale-while-revalidate for the app's own files (pdf.js is cached the first time it's used).
// Demo lists are network-first, so adding or updating one never gets an outdated copy.
// Cross-origin requests (example sentences from Tatoeba) go straight to the network.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    const fromNetwork = () => fetch(request.mode === 'navigate' ? request : new Request(request, { cache: 'no-cache' }))
        .then((res) => {
            if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
        });
    if (url.pathname.includes('/demo/')) {
        event.respondWith(fromNetwork().catch(() => caches.match(request, { ignoreSearch: true })
            .then((cached) => cached || Promise.reject(new Error('offline')))));
        return;
    }
    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then((cached) => {
            const network = fromNetwork().catch(() => cached || caches.match('index.html'));
            return cached || network;
        })
    );
});
