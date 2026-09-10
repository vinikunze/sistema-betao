const CACHE_NAME = 'betao-app-v6';

self.addEventListener('install', event => {
    self.skipWaiting(); // Força a atualização imediata do cache
});

self.addEventListener('activate', event => {
    // Limpa caches antigos automaticamente
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// ESTRATÉGIA NETWORK-FIRST (Sempre tenta pegar o código mais novo, evita tela preta)
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});