import { fileRank, toSquare, PIECE_VALUE, type Color, type BoardMap, type Piece } from '../attacks';
import type { MotifHit } from './types';

const NAME: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/** A slider aligned against two enemy pieces on the same ray. */
export interface Alignment {
  slider: Piece;
  front: Piece; // nearer enemy
  rear: Piece; // farther enemy
}

/**
 * All alignments where a sliding piece of `byColor` sees an enemy `front`
 * piece and, directly behind it on the same ray, an enemy `rear` piece with
 * no pieces between them. This is the shared geometry behind pins and skewers.
 */
export function alignments(board: BoardMap, byColor: Color): Alignment[] {
  const victim: Color = byColor === 'w' ? 'b' : 'w';
  const out: Alignment[] = [];

  for (const slider of board.values()) {
    if (slider.color !== byColor) continue;
    const dirs =
      slider.type === 'b'
        ? BISHOP_DIRS
        : slider.type === 'r'
          ? ROOK_DIRS
          : slider.type === 'q'
            ? [...BISHOP_DIRS, ...ROOK_DIRS]
            : null;
    if (!dirs) continue;

    const [sf, sr] = fileRank(slider.square);
    for (const [df, dr] of dirs) {
      const found = walkTwo(board, sf, sr, df, dr, victim);
      if (found) out.push({ slider, front: found[0], rear: found[1] });
    }
  }
  return out;
}

/** Walk a ray, returning [firstEnemy, secondEnemy] if that's the pattern. */
function walkTwo(
  board: BoardMap,
  f: number,
  r: number,
  df: number,
  dr: number,
  victim: Color
): [Piece, Piece] | null {
  let nf = f + df;
  let nr = r + dr;
  let front: Piece | null = null;

  while (true) {
    const s = toSquare(nf, nr);
    if (!s) return null;
    const p = board.get(s);
    if (p) {
      if (!front) {
        // First piece must be an enemy to start a pin/skewer.
        if (p.color !== victim) return null;
        front = p;
      } else {
        // Second piece: only an enemy behind the front completes the pattern.
        return p.color === victim ? [front, p] : null;
      }
    }
    nf += df;
    nr += dr;
  }
}

/**
 * A pin: the rear piece is worth more than the front piece (or the rear is the
 * king → absolute pin), so the front piece can't move without losing the rear.
 */
export function detectPin(board: BoardMap, byColor: Color): MotifHit[] {
  const hits: MotifHit[] = [];
  for (const { slider, front, rear } of alignments(board, byColor)) {
    const absolute = rear.type === 'k';
    if (absolute || PIECE_VALUE[rear.type] > PIECE_VALUE[front.type]) {
      hits.push({
        motif: 'pin',
        square: slider.square,
        targets: [front.square, rear.square],
        value: PIECE_VALUE[front.type],
        detail: absolute
          ? `${NAME[front.type]} pinned to the king`
          : `${NAME[front.type]} pinned to the ${NAME[rear.type]}`,
      });
    }
  }
  return hits.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}
