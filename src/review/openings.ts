import { Chess } from 'chess.js';
import tsv from '../data/openings.tsv?raw';

export interface Opening {
  eco: string;
  name: string;
}

/**
 * Book positions keyed by the first four FEN fields (placement, side, castling,
 * en passant) — move counters are dropped so transpositions match.
 *
 * The TSV stores opening lines as SAN move sequences; we replay each line and
 * index EVERY position along it. That guarantees the FEN keys are correct
 * (hand-writing opening FENs is error-prone) and lets "is this still book?"
 * be a single map lookup.
 */
const BOOK = buildBook();

function buildBook(): Map<string, Opening> {
  const map = new Map<string, Opening>();
  const lines = tsv.trim().split('\n');
  // Skip header row.
  for (const row of lines.slice(1)) {
    const [eco, name, moves] = row.split('\t');
    if (!moves) continue;
    const chess = new Chess();
    for (const san of moves.trim().split(/\s+/)) {
      try {
        const m = chess.move(san);
        if (!m) break;
      } catch {
        break;
      }
      // Index the position AFTER each move; deeper lines overwrite shallower
      // ones, so the most specific name wins for shared positions.
      map.set(fenKey(chess.fen()), { eco, name });
    }
  }
  return map;
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
