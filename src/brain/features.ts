import { Chess } from 'chess.js';
import {
  boardMap,
  fileRank,
  attackersOf,
  toSquare,
  type BoardMap,
  type Color,
} from './attacks';

/**
 * A positional feature vector, all values from White's perspective
 * (positive = better for White). This is the fallback explanation layer: when
 * no tactic fires, we diff the position the player got against the position
 * the engine's move would have given and report the biggest positional change.
 */
export interface Features {
  mobility: number; // legal-move count difference (White - Black)
  doubledPawns: number; // Black doubled - White doubled (positive good for White)
  isolatedPawns: number; // Black isolated - White isolated
  passedPawns: number; // White passed - Black passed
  kingSafety: number; // attackers near Black king - attackers near White king
  openFiles: number; // White rooks/queens on open files - Black
  development: number; // White developed minors - Black developed minors
}

const HOME_MINORS: Record<Color, string[]> = {
  w: ['b1', 'g1', 'c1', 'f1'],
  b: ['b8', 'g8', 'c8', 'f8'],
};

export function extractFeatures(fen: string): Features {
  const chess = new Chess(fen);
  const board = boardMap(chess);

  return {
    mobility: mobilityFor(fen, 'w') - mobilityFor(fen, 'b'),
    doubledPawns: doubled(board, 'b') - doubled(board, 'w'),
    isolatedPawns: isolated(board, 'b') - isolated(board, 'w'),
    passedPawns: passed(board, 'w') - passed(board, 'b'),
    kingSafety: kingZoneAttackers(board, 'b') - kingZoneAttackers(board, 'w'),
    openFiles: heavyOnOpenFiles(board, 'w') - heavyOnOpenFiles(board, 'b'),
    development: developedMinors(board, 'w') - developedMinors(board, 'b'),
  };
}

/** Weights for ranking which feature delta is the "headline" change. */
const WEIGHTS: Record<keyof Features, number> = {
  mobility: 0.05,
  doubledPawns: 0.4,
  isolatedPawns: 0.4,
  passedPawns: 0.6,
  kingSafety: 0.8,
  openFiles: 0.5,
  development: 0.35,
};

/** Human phrasing for a positive/negative change in each feature, mover POV. */
const PHRASE: Record<keyof Features, [worse: string, better: string]> = {
  mobility: ['it leaves your pieces with less room', 'it frees your pieces'],
  doubledPawns: ['it saddles you with doubled pawns', 'it fixes your pawn structure'],
  isolatedPawns: ['it leaves you an isolated pawn', 'it repairs an isolated pawn'],
  passedPawns: ['it lets a passed pawn slip away', 'it creates a passed pawn'],
  kingSafety: ['it exposes your king', 'it shores up your king'],
  openFiles: ['it concedes the open file', 'it seizes the open file'],
  development: ['it falls behind in development', 'it gets a piece into play'],
};

/**
 * Compare the position the player reached against the one the best move would
 * have given, and return a short phrase for the biggest positional swing from
 * the mover's perspective. Returns a generic phrase if nothing stands out.
 */
export function topFeatureDelta(
  bestFen: string,
  playedFen: string,
  mover: Color
): string {
  const best = extractFeatures(bestFen);
  const played = extractFeatures(playedFen);
  const sign = mover === 'w' ? 1 : -1;

  let bestKey: keyof Features | null = null;
  let bestMag = 0;
  let bestDir = 0;

  for (const key of Object.keys(WEIGHTS) as (keyof Features)[]) {
    // Change from mover's POV: negative = worse for the mover.
    const delta = (played[key] - best[key]) * sign;
    const mag = Math.abs(delta) * WEIGHTS[key];
    if (mag > bestMag) {
      bestMag = mag;
      bestKey = key;
      bestDir = delta;
    }
  }

  if (!bestKey || bestMag < 0.3) return 'it keeps less pressure';
  const [worse, better] = PHRASE[bestKey];
  return bestDir < 0 ? worse : better;
}

// --- individual feature computations -------------------------------------

function mobilityFor(fen: string, color: Color): number {
  const parts = fen.split(/\s+/);
  parts[1] = color;
  parts[3] = '-'; // drop en-passant target to avoid illegal-FEN rejections
  try {
    const c = new Chess();
    c.load(parts.join(' '));
    return c.moves().length;
  } catch {
    return 0;
  }
}

function pawnsByFile(board: BoardMap, color: Color): number[] {
  const files = new Array(8).fill(0);
  for (const p of board.values()) {
    if (p.color === color && p.type === 'p') {
      files[fileRank(p.square)[0]]++;
    }
  }
  return files;
}

function doubled(board: BoardMap, color: Color): number {
  return pawnsByFile(board, color).reduce((s, n) => s + (n > 1 ? n - 1 : 0), 0);
}

function isolated(board: BoardMap, color: Color): number {
  const files = pawnsByFile(board, color);
  let count = 0;
  for (let f = 0; f < 8; f++) {
    if (files[f] === 0) continue;
    const left = f > 0 ? files[f - 1] : 0;
    const right = f < 7 ? files[f + 1] : 0;
    if (left === 0 && right === 0) count += files[f];
  }
  return count;
}

function passed(board: BoardMap, color: Color): number {
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const dir = color === 'w' ? 1 : -1;
  let count = 0;
  for (const p of board.values()) {
    if (p.color !== color || p.type !== 'p') continue;
    const [pf, pr] = fileRank(p.square);
    let blocked = false;
    for (const ef of [pf - 1, pf, pf + 1]) {
      if (ef < 0 || ef > 7) continue;
      for (const e of board.values()) {
        if (e.color !== enemy || e.type !== 'p') continue;
        const [ef2, er] = fileRank(e.square);
        if (ef2 === ef && (er - pr) * dir > 0) blocked = true;
      }
    }
    if (!blocked) count++;
  }
  return count;
}

function kingZoneAttackers(board: BoardMap, kingColor: Color): number {
  const enemy: Color = kingColor === 'w' ? 'b' : 'w';
  let king: string | null = null;
  for (const p of board.values()) {
    if (p.color === kingColor && p.type === 'k') king = p.square;
  }
  if (!king) return 0;
  const [kf, kr] = fileRank(king);
  let count = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const s = toSquare(kf + df, kr + dr);
      if (s) count += attackersOf(board, s, enemy).length;
    }
  }
  return count;
}

function heavyOnOpenFiles(board: BoardMap, color: Color): number {
  const whitePawns = pawnsByFile(board, 'w');
  const blackPawns = pawnsByFile(board, 'b');
  let count = 0;
  for (const p of board.values()) {
    if (p.color !== color || (p.type !== 'r' && p.type !== 'q')) continue;
    const f = fileRank(p.square)[0];
    if (whitePawns[f] === 0 && blackPawns[f] === 0) count++;
  }
  return count;
}

function developedMinors(board: BoardMap, color: Color): number {
  const home = new Set(HOME_MINORS[color]);
  let count = 0;
  for (const p of board.values()) {
    if (p.color === color && (p.type === 'n' || p.type === 'b')) {
      if (!home.has(p.square)) count++;
    }
  }
  return count;
}
