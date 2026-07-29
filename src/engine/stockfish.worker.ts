// Stockfish bootstrap.
//
// The `stockfish` npm single-file build IS itself a Web Worker that speaks the
// UCI protocol over postMessage — so the cleanest, most robust design is to
// spawn it directly rather than nest it inside another custom worker (nested
// workers are flaky across browsers, and module-worker `importScripts` is not
// allowed). This module just resolves the correct URL and constructs the raw
// worker; `analyzer.ts` drives the UCI conversation on top of it.
//
// The engine binary is copied into public/engine by scripts/fetch-stockfish.mjs
// at install time. If it is missing, engine construction throws a clear error.

/** Resolve the URL of the Stockfish worker script served from /public. */
export function engineUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}engine/stockfish.js`;
}

/**
 * Create the raw Stockfish worker. Classic (non-module) worker — the single
 * file build is UMD and sets up its own onmessage UCI handler.
 */
export function createStockfishWorker(): Worker {
  return new Worker(engineUrl());
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
