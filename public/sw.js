// Service worker for offline use.
//
// Two strategies:
//  1. Precache the stable, heavy assets on install — the engine (worker, wasm,
//     40 MB neural net) and the openings DB — so a single online visit makes
//     the app fully usable offline (e.g. on a plane).
//  2. Runtime cache-first for everything else same-origin (the hashed app
//     shell: HTML, JS, CSS) — cached as it's first fetched.

const CACHE = 'chess-review-v1';

const PRECACHE = [
  './',
  './index.html',
  './engine/manifest.json',
  './engine/stockfish.js',
  './engine/stockfish-nnue-16-single.js',
  './engine/stockfish-nnue-16-single.wasm',
  './engine/stockfish-nnue-16.js',
  './engine/stockfish-nnue-16.wasm',
  './engine/nn-5af11540bbfe.nnue',
  './openings/openings.tsv',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Cache each individually so one 404 doesn't abort the whole install.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      // Also precache the hashed app bundle referenced by index.html — the SW
      // doesn't control the first page load, so those requests would otherwise
      // never be cached, breaking offline until a second visit.
      try {
        const res = await fetch('./index.html', { cache: 'no-cache' });
        const html = await res.text();
        const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
          .map((m) => m[1])
          .filter((u) => /\/?assets\//.test(u) || /\.(js|css)$/.test(u));
        await Promise.allSettled([...new Set(assets)].map((u) => cache.add(u)));
      } catch {
        /* best effort */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // only handle same-origin

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // ignoreVary: the server sends `Vary: Origin`, which would otherwise stop
      // cached entries from matching plain navigation/subresource requests.
      const cached = await cache.match(req, { ignoreVary: true });
      if (cached) {
        // Serve cached immediately. Only revalidate the HTML shell in the
        // background — the engine (40 MB net + wasm), openings, and hashed
        // JS/CSS are immutable, so re-fetching them every load was pure waste.
        if (req.mode === 'navigate') event.waitUntil(refresh(cache, req));
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        // Offline and not cached — fall back to the app shell for navigations.
        if (req.mode === 'navigate') {
          const shell =
            (await cache.match('./index.html', { ignoreVary: true })) ||
            (await cache.match('./', { ignoreVary: true }));
          if (shell) return shell;
        }
        return Response.error();
      }
    })()
  );
});

async function refresh(cache, req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === 'basic') {
      await cache.put(req, res.clone());
    }
  } catch {
    /* offline — keep the cached copy */
  }
}
