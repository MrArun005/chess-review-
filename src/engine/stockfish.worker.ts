// Stockfish bootstrap.
//
// The `stockfish` npm single-file build IS itself a Web Worker that speaks the
// UCI protocol over postMessage — so the cleanest, most robust design is to
// spawn it directly rather than nest it inside another custom worker (nested
// workers are flaky across browsers, and module-worker `importScripts` is not
// allowed). `analyzer.ts` drives the UCI conversation on top of it.
//
// scripts/fetch-stockfish.mjs copies the engine builds into public/engine and
// writes a manifest naming the single- and multi-threaded entries. We pick the
// multi-threaded build (3-4x faster) when the page is cross-origin isolated —
// which the Vercel/Netlify headers in this repo enable — and fall back to the
// single-threaded build everywhere else.

interface EngineManifest {
  single: string;
  multi: string | null;
}

export interface EngineChoice {
  url: string;
  /** True if this is the multi-threaded build (Threads > 1 will take effect). */
  threaded: boolean;
}

/** Resolve which engine build to load for this environment. */
export async function resolveEngine(): Promise<EngineChoice> {
  const base = import.meta.env.BASE_URL ?? '/';
  const manifest = await loadManifest(base);

  const isolated =
    typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === true;

  if (isolated && manifest?.multi) {
    return { url: `${base}engine/${manifest.multi}`, threaded: true };
  }
  const single = manifest?.single ?? 'stockfish.js';
  return { url: `${base}engine/${single}`, threaded: false };
}

async function loadManifest(base: string): Promise<EngineManifest | null> {
  try {
    const res = await fetch(`${base}engine/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return (await res.json()) as EngineManifest;
  } catch {
    // No manifest (older install / manual drop): fall back to the alias.
    return null;
  }
}

/** Construct the raw Stockfish worker (classic worker — the build is UMD). */
export function createWorker(url: string): Worker {
  return new Worker(url);
}

/** Normalize a message event payload to a UCI text line. */
export function readLine(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object' && 'data' in data) {
    const inner = (data as { data: unknown }).data;
    if (typeof inner === 'string') return inner;
  }
  return '';
}
