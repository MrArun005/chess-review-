import type { PvLine } from './types';

/**
 * Parse one `info ...` line from Stockfish into a partial PV line.
 *
 * The UCI score is ALWAYS from the side-to-move's perspective. This parser
 * returns the raw score as reported; normalization to White's perspective is
 * the caller's job (it needs to know whose move it is) — see `normalizeToWhite`.
 *
 * Returns null for `info` lines that don't carry a PV (e.g. `info depth 1
 * seldepth 1 ... string ...`), so callers can ignore them cheaply.
 */
export function parseInfoLine(line: string): RawPvLine | null {
  if (!line.startsWith('info') || !line.includes(' pv ')) return null;

  const depth = intAfter(line, / depth (\d+)/);
  const multipv = intAfter(line, /multipv (\d+)/) ?? 1;

  const mateMatch = line.match(/score mate (-?\d+)/);
  const cpMatch = line.match(/score cp (-?\d+)/);

  // A move can be both — Stockfish never reports mate and cp together, but be
  // defensive: mate wins.
  const mate = mateMatch ? Number(mateMatch[1]) : null;
  const cp = mate === null && cpMatch ? Number(cpMatch[1]) : null;

  const pvPart = line.split(' pv ')[1];
  if (!pvPart) return null;
  const pv = pvPart.trim().split(/\s+/).filter(Boolean);
  if (pv.length === 0) return null;

  return {
    depth: depth ?? 0,
    multipv,
    // side-to-move perspective, un-normalized
    cpStm: cp,
    mateStm: mate,
    pv,
  };
}

/** True for a `bestmove ...` terminator line. */
export function isBestmove(line: string): boolean {
  return line.startsWith('bestmove');
}

/** Extract the move from a `bestmove e2e4 ponder e7e5` line. */
export function parseBestmove(line: string): string | null {
  const m = line.match(/^bestmove\s+(\S+)/);
  if (!m) return null;
  return m[1] === '(none)' ? null : m[1];
}

/**
 * Flip a side-to-move-relative raw line into White's perspective.
 *
 * When Black is to move, a score of "+50 for the side to move" means Black is
 * up half a pawn, i.e. -50 for White. Same sign flip for mate distance.
 */
export function normalizeToWhite(raw: RawPvLine, sideToMove: 'w' | 'b'): PvLine {
  const flip = sideToMove === 'b' ? -1 : 1;
  return {
    depth: raw.depth,
    multipv: raw.multipv,
    cp: raw.cpStm === null ? null : raw.cpStm * flip,
    mate: raw.mateStm === null ? null : raw.mateStm * flip,
    pv: raw.pv,
  };
}

/** A parsed PV line still in the side-to-move's perspective. */
export interface RawPvLine {
  depth: number;
  multipv: number;
  cpStm: number | null;
  mateStm: number | null;
  pv: string[];
}

function intAfter(s: string, re: RegExp): number | null {
  const m = s.match(re);
  return m ? Number(m[1]) : null;
}
