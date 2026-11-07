const CACHE = 'woordjes-v15';
// Relative to this file, so the app works from any folder (e.g. GitHub Pages /repo-name/).
const SHELL = [
    './',
    'index.html',
    'styles.css',
    'store.js',
    'app.js',
    'parser.js',
    'manifest.json',
    'demo/basic-100.json',
    'icons/icon-180.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
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

// Stale-while-revalidate for the app's own files (pdf.js is cached the first time it's used).
// Cross-origin requests (example sentences from Tatoeba) go straight to the network.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then((cached) => {
            const network = fetch(request)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE).then((c) => c.put(request, copy));
                    }
                    return res;
                })
                .catch(() => cached || caches.match('index.html'));
            return cached || network;
        })
    );
});
