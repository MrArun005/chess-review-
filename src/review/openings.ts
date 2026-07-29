import { Chess } from 'chess.js';
import bundled from '../data/openings.tsv?raw';

export interface Opening {
  eco: string;
  name: string;
}

/**
 * Book positions keyed by the first four FEN fields (placement, side, castling,
 * en passant) — move counters dropped so transpositions match.
 *
 * We ship a small curated set bundled in the JS (instant, offline) and lazily
 * load the full ~3,600-line lichess database from /openings/openings.tsv at
 * runtime, merging it in. Keeping the big file out of the bundle avoids a
 * ~400 KB hit to first paint. Opening lines are stored as move sequences and
 * replayed, so the FEN keys are always correct; every position along a line is
 * indexed.
 */
let BOOK = buildBook(bundled);
let loaded = false;
let loading: Promise<void> | null = null;

/** Load and merge the full opening database. Idempotent; safe to call often. */
export function ensureOpenings(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const base = import.meta.env.BASE_URL ?? '/';
      const res = await fetch(`${base}openings/openings.tsv`, { cache: 'force-cache' });
      if (res.ok) {
        const full = buildBook(await res.text());
        // Full set overwrites curated entries for shared positions (more
        // specific names win).
        for (const [k, v] of full) BOOK.set(k, v);
      }
    } catch {
      // Offline / missing file: keep the curated fallback.
    } finally {
      loaded = true;
    }
  })();
  return loading;
}

function buildBook(tsv: string): Map<string, Opening> {
  const map = new Map<string, Opening>();
  const lines = tsv.trim().split('\n');
  for (const row of lines.slice(1)) {
    const cols = row.split('\t');
    const eco = cols[0];
    const name = cols[1];
    const moves = cols[2];
    if (!moves) continue;
    indexLine(map, eco, name, moves);
  }
  return map;
}

/** Replay one opening line, indexing every position along it. */
function indexLine(map: Map<string, Opening>, eco: string, name: string, movesField: string): void {
  const chess = new Chess();
  const tokens = movesField
    .trim()
    .split(/\s+/)
    // Drop move numbers ("1.", "12...") and result markers.
    .filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));

  for (const san of tokens) {
    try {
      const m = chess.move(san);
      if (!m) break;
    } catch {
      break;
    }
    map.set(fenKey(chess.fen()), { eco, name });
  }
}

/** Normalize a FEN to its first four fields (drop halfmove/fullmove counters). */
export function fenKey(fen: string): string {
  return fen.split(/\s+/).slice(0, 4).join(' ');
}

/** Look up the opening name for a position, if it is a known book position. */
export function lookupOpening(fen: string): Opening | null {
  return BOOK.get(fenKey(fen)) ?? null;
}

/** True if the position is still in book. */
export function isBookPosition(fen: string): boolean {
  return BOOK.has(fenKey(fen));
}
