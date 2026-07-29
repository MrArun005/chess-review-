import {
  fileRank,
  toSquare,
  attackersOf,
  cheapestAttacker,
  PIECE_VALUE,
  type Color,
  type BoardMap,
  type PieceType,
} from '../attacks';
import type { MotifHit } from './types';

const NAME: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

const KNIGHT_D = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const BISHOP_D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_D = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/**
 * A trapped piece for `victimColor`: a knight, bishop, rook or queen that is
 * currently attacked, and every square it could move to is covered by an enemy
 * piece cheap enough that moving there just loses it anyway. Approximate (it
 * ignores discovered defenses and pins) but reliable for the common "your
 * bishop has nowhere to go" case.
 */
export function detectTrapped(board: BoardMap, victimColor: Color): MotifHit[] {
  const attacker: Color = victimColor === 'w' ? 'b' : 'w';
  const hits: MotifHit[] = [];

  for (const piece of board.values()) {
    if (piece.color !== victimColor) continue;
    if (!['n', 'b', 'r', 'q'].includes(piece.type)) continue;

    // Only interesting if the piece is actually under attack right now.
    const attackers = attackersOf(board, piece.square, attacker);
    if (attackers.length === 0) continue;
    const value = PIECE_VALUE[piece.type];
    // If the cheapest attacker is >= its value and it's defended, not "trapped"
    // in the losing sense — skip to avoid noise.
    if (cheapestAttacker(attackers) >= value) continue;

    const dests = destinations(board, piece.square, piece.type, victimColor);
    if (dests.length === 0) continue; // pinned/blocked entirely — treat separately

    const allCovered = dests.every((d) => {
      const enemyAttackers = attackersOf(board, d, attacker);
      if (enemyAttackers.length === 0) return false; // safe square exists
      // Escaping to a square guarded by something cheaper still loses the piece.
      return cheapestAttacker(enemyAttackers) <= value;
    });

    if (allCovered) {
      hits.push({
        motif: 'trapped',
        square: piece.square,
        value,
        detail: `the ${NAME[piece.type]} has no safe square`,
      });
    }
  }

  return hits.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

/** Pseudo-legal destination squares (empty or enemy-occupied) for a piece. */
function destinations(
  board: BoardMap,
  square: string,
  type: PieceType,
  color: Color
): string[] {
  const [f, r] = fileRank(square);
  const out: string[] = [];

  const consider = (s: string | null): 'stop' | 'continue' | 'skip' => {
    if (!s) return 'stop';
    const occ = board.get(s);
    if (!occ) {
      out.push(s);
      return 'continue';
    }
    if (occ.color !== color) out.push(s); // capture
    return 'stop'; // blocked either way
  };

  if (type === 'n') {
    for (const [df, dr] of KNIGHT_D) {
      const s = toSquare(f + df, r + dr);
      if (s) {
        const occ = board.get(s);
        if (!occ || occ.color !== color) out.push(s);
      }
    }
    return out;
  }

  const dirs =
    type === 'b' ? BISHOP_D : type === 'r' ? ROOK_D : [...BISHOP_D, ...ROOK_D];
  for (const [df, dr] of dirs) {
    let nf = f + df;
    let nr = r + dr;
    while (true) {
      const res = consider(toSquare(nf, nr));
      if (res === 'stop') break;
      nf += df;
      nr += dr;
    }
  }
  return out;
}
