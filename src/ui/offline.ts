// Explicit "download for offline" support on top of the service worker.
//
// The service worker already precaches on install, but this gives the user a
// visible control: a button that downloads the engine + openings (with
// progress) and confirms the app is ready to use with no internet. Fetching
// the assets while the page is controlled by the SW populates its cache.

const CACHE = 'chess-review-v1';

function base(): string {
  return import.meta.env.BASE_URL ?? '/';
}

/** The big neural net that dominates the offline download (~40 MB). */
function nnueUrl(): string {
  return `${base()}engine/nn-5af11540bbfe.nnue`;
}

/** Assets that must be cached for the app to fully work offline. */
function criticalAssets(): string[] {
  const b = base();
  return [
    nnueUrl(),
    `${b}engine/stockfish-nnue-16-single.wasm`,
    `${b}engine/stockfish.js`,
    `${b}openings/openings.tsv`,
  ];
}

export function offlineSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'caches' in window;
}

/** True if everything needed to run offline is already cached. */
export async function isOfflineReady(): Promise<boolean> {
  if (!offlineSupported()) return false;
  try {
    const cache = await caches.open(CACHE);
    for (const url of criticalAssets()) {
      if (!(await cache.match(url, { ignoreVary: true }))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Download and cache everything for offline use, reporting 0-100 progress
 * (dominated by the neural net). Resolves true once the app is offline-ready.
 */
export async function downloadForOffline(onProgress: (pct: number) => void): Promise<boolean> {
  if (!offlineSupported()) return false;
  // Make sure the SW is active and controlling the page so our fetches get cached.
  try {
    await navigator.serviceWorker.ready;
  } catch {
    /* continue anyway */
  }

  const b = base();
  const small = [
    b,
    `${b}index.html`,
    `${b}engine/manifest.json`,
    `${b}engine/stockfish.js`,
    `${b}engine/stockfish-nnue-16-single.js`,
    `${b}engine/stockfish-nnue-16-single.wasm`,
    `${b}openings/openings.tsv`,
  ];
  await Promise.allSettled(small.map((u) => fetch(u).catch(() => undefined)));
  onProgress(5);

  // The neural net, streamed for progress.
  try {
    const res = await fetch(nnueUrl());
    const total = Number(res.headers.get('content-length')) || 0;
    if (res.body && total) {
      const reader = res.body.getReader();
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value?.length ?? 0;
        onProgress(5 + Math.min(94, Math.round((got / total) * 94)));
      }
    } else {
      await res.arrayBuffer();
    }
  } catch {
    /* may already be cached / offline */
  }

  onProgress(100);
  return isOfflineReady();
}
