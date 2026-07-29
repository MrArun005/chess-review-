// Copies a Stockfish build out of node_modules into public/engine so the app
// can load it as a same-origin worker asset (no CDN, no network at runtime).
//
// The `stockfish` npm package (v16) ships several builds under src/:
//   stockfish-nnue-16-single.js    single-threaded — runs WITHOUT cross-origin
//                                   isolation, our default entry
//   stockfish-nnue-16.js           multi-threaded — needs COOP/COEP headers
//   nn-*.nnue                       external neural net the wasm loads by name
//
// Each build's .js is an Emscripten module that also acts as a UCI worker when
// constructed with `new Worker(...)`. It resolves its sibling .wasm and .nnue
// by their original filenames relative to itself, so we copy EVERY file and add
// a stable `stockfish.js` alias pointing at the single-threaded build.

import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, '..');
const outDir = join(projectRoot, 'public', 'engine');

const srcDir = findStockfishSrc();
if (!srcDir) {
  console.warn(
    '[fetch-stockfish] Could not find the "stockfish" package in node_modules.\n' +
      '  Run `npm install` first, or drop a single-file Stockfish build at\n' +
      '  public/engine/stockfish.js (plus its .wasm) manually.'
  );
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => /\.(js|wasm|nnue)$/.test(f));
if (files.length === 0) {
  console.warn(`[fetch-stockfish] No engine files found in ${srcDir}.`);
  process.exit(0);
}

let copied = 0;
for (const f of files) {
  copyFileSync(join(srcDir, f), join(outDir, f));
  copied++;
}

const entry = pickEntry(files);
if (!entry) {
  console.warn('[fetch-stockfish] No suitable .js entry found; leaving files as-is.');
  process.exit(0);
}
if (entry !== 'stockfish.js') {
  copyFileSync(join(srcDir, entry), join(outDir, 'stockfish.js'));
}

// Also identify the multi-threaded build, so the app can use it on hosts that
// send the cross-origin isolation headers (3-4x faster). We load the real
// filenames from a manifest at runtime and pick single vs multi by whether the
// page is crossOriginIsolated.
const multi = pickMulti(files);
const manifest = { single: entry, multi };
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(
  `[fetch-stockfish] Copied ${copied} file(s) from ${srcDir}\n` +
    `  Single-threaded entry -> public/engine/stockfish.js (source: ${entry})\n` +
    `  Multi-threaded entry  -> ${multi ?? '(none found)'}\n` +
    `  Manifest              -> public/engine/manifest.json`
);

/** Locate the directory inside the stockfish package that holds the builds. */
function findStockfishSrc() {
  const candidates = [
    join(projectRoot, 'node_modules', 'stockfish', 'src'),
    join(projectRoot, 'node_modules', 'stockfish'),
  ];
  return candidates.find((c) => existsSync(c) && hasEngineFiles(c)) ?? null;
}

function hasEngineFiles(dir) {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.wasm') || f.endsWith('.js'));
  } catch {
    return false;
  }
}

/**
 * Pick the JS entry. Prefer the single-threaded build (no COOP/COEP needed),
 * skipping the "no-Worker" variant which can't be spawned as a worker. Fall
 * back to any worker-capable build, then to the largest .js.
 */
function pickEntry(fileList) {
  const js = fileList.filter((f) => f.endsWith('.js') && !/no-?worker/i.test(f));
  return (
    js.find((f) => /single/i.test(f)) ??
    js.find((f) => /nnue-16\.js$/i.test(f)) ??
    js.find((f) => /stockfish/i.test(f)) ??
    largest(js) ??
    null
  );
}

function largest(list) {
  let best = null;
  let bestSize = -1;
  for (const f of list) {
    const size = statSync(join(srcDir, f)).size;
    if (size > bestSize) {
      bestSize = size;
      best = f;
    }
  }
  return best;
}

/**
 * Pick the multi-threaded entry: a worker-capable build that is NOT the
 * single-threaded one. Prefer the plain SIMD build (`stockfish-nnue-16.js`),
 * then any non-single, non-no-Worker build. Returns null if only a
 * single-threaded build ships.
 */
function pickMulti(fileList) {
  const js = fileList.filter(
    (f) => f.endsWith('.js') && !/single/i.test(f) && !/no-?worker/i.test(f)
  );
  return (
    js.find((f) => /nnue-16\.js$/i.test(f)) ??
    js.find((f) => /nnue-16-no-simd\.js$/i.test(f)) ??
    js[0] ??
    null
  );
}
