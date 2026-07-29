import type { Chess } from 'chess.js';

/** Standard material values (king = 0 for material counting). */
export const PIECE_VALUE: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: Color;
  square: string;
}

/** Board as a square -> piece map, keyed by algebraic square ("e4"). */
export type BoardMap = Map<string, Piece>;

export function boardMap(chess: Chess): BoardMap {
  const map: BoardMap = new Map();
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) {
        map.set(cell.square, {
          type: cell.type as PieceType,
          color: cell.color as Color,
          square: cell.square,
        });
      }
    }
  }
  return map;
}

/** File index 0-7 (a-h) and rank index 0-7 (rank 1 -> 0). */
export function fileRank(square: string): [number, number] {
  return [square.charCodeAt(0) - 97, Number(square[1]) - 1];
}

export function toSquare(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return String.fromCharCode(97 + file) + (rank + 1);
}

const KNIGHT_D = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_D = [
  [0, 1], [1, 1], [1, 0], [1, -1],
  [0, -1], [-1, -1], [-1, 0], [-1, 1],
];
const BISHOP_D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_D = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/**
 * All pieces of `byColor` that attack `target`. Purely geometric — ignores
 * pins and whose turn it is, which is exactly what we want for "is this square
 * hanging / forked" questions.
 */
export function attackersOf(
  board: BoardMap,
  target: string,
  byColor: Color
): Piece[] {
  const [tf, tr] = fileRank(target);
  const out: Piece[] = [];

  // Pawns: attack diagonally toward the opponent. A white pawn on the board
  // attacks the squares one rank ABOVE it, so it attacks `target` from below.
  const pawnRankDir = byColor === 'w' ? -1 : 1; // where the attacking pawn sits relative to target
  for (const df of [-1, 1]) {
    const s = toSquare(tf + df, tr + pawnRankDir);
    if (s) {
      const p = board.get(s);
      if (p && p.color === byColor && p.type === 'p') out.push(p);
    }
  }

  // Knights.
  for (const [df, dr] of KNIGHT_D) {
    const s = toSquare(tf + df, tr + dr);
    if (s) {
      const p = board.get(s);
      if (p && p.color === byColor && p.type === 'n') out.push(p);
    }
  }

  // King.
  for (const [df, dr] of KING_D) {
    const s = toSquare(tf + df, tr + dr);
    if (s) {
      const p = board.get(s);
      if (p && p.color === byColor && p.type === 'k') out.push(p);
    }
  }

  // Sliding pieces: bishops/queens on diagonals, rooks/queens on files/ranks.
  for (const [df, dr] of BISHOP_D) {
    const p = firstOnRay(board, tf, tr, df, dr);
    if (p && p.color === byColor && (p.type === 'b' || p.type === 'q')) out.push(p);
  }
  for (const [df, dr] of ROOK_D) {
    const p = firstOnRay(board, tf, tr, df, dr);
    if (p && p.color === byColor && (p.type === 'r' || p.type === 'q')) out.push(p);
  }

  return out;
}

/** First piece encountered walking a ray from (f,r) in direction (df,dr). */
function firstOnRay(
  board: BoardMap,
  f: number,
  r: number,
  df: number,
  dr: number
): Piece | null {
  let nf = f + df;
  let nr = r + dr;
  while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
    const s = toSquare(nf, nr)!;
    const p = board.get(s);
    if (p) return p;
    nf += df;
    nr += dr;
  }
  return null;
}

/** Pieces of the same color defending `square` (its own color = defenders). */
export function defendersOf(board: BoardMap, square: string): Piece[] {
  const piece = board.get(square);
  if (!piece) return [];
  return attackersOf(board, square, piece.color).filter(
    (p) => p.square !== square
  );
}

/** Value of the cheapest attacker, or Infinity if none. */
export function cheapestAttacker(attackers: Piece[]): number {
  return attackers.reduce(
    (min, p) => Math.min(min, PIECE_VALUE[p.type]),
    Infinity
  );
}

export function isColor(x: string | undefined): x is Color {
  return x === 'w' || x === 'b';
}
