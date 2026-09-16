const CACHE_NAME = 'betao-app-v14';

self.addEventListener('install', event => {
    self.skipWaiting(); // Força a atualização imediata do cache
});

self.addEventListener('activate', event => {
    // Limpa caches antigos e assume o controle das abas já abertas
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            ))
            .then(() => self.clients.claim())
    );
});

/* O service worker cuida SÓ dos arquivos do próprio site.
   Antes ele interceptava tudo, inclusive as chamadas ao Supabase, e isso
   causava dois problemas:
   1. No WebKit (todo navegador do iPhone/iPad, Chrome incluído), reemitir um
      POST cross-origin de dentro do service worker falha — era o que derrubava
      o cadastro e o login no celular.
   2. Quando a rede falhava, ele respondia com `caches.match`, que devolvia
      undefined porque nada nunca era gravado no cache. Responder undefined faz
      o navegador lançar "TypeError: Load failed", escondendo o erro de verdade.
   Agora: só GET do mesmo domínio passa por aqui; o resto vai direto pra rede. */
self.addEventListener('fetch', event => {
    const req = event.request;

    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== self.location.origin) return;

    // NETWORK-FIRST: sempre tenta o código mais novo; o cache é só rede de segurança offline.
    event.respondWith(
        fetch(req)
            .then(resp => {
                if (resp && resp.ok) {
                    const copia = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copia)).catch(() => { });
                }
                return resp;
            })
            .catch(() => caches.match(req).then(cached => cached || Response.error()))
    );
});
