import { fileRank, toSquare, type Color, type BoardMap } from '../attacks';
import type { MotifHit } from './types';

/**
 * Back-rank weakness for `victimColor`: their king sits on its home rank, every
 * escape square one rank forward is blocked by a friendly piece (usually the
 * unmoved pawn shield), and the opponent has a rook or queen that can operate
 * on the back rank. A check along that rank would then be mate.
 *
 * This is a structural flag (the weakness exists), not proof of forced mate —
 * the engine's mate score covers the forced case. It's what fires when a move
 * "leaves the back rank loose".
 */
export function detectBackrank(board: BoardMap, victimColor: Color): MotifHit[] {
  const homeRankIdx = victimColor === 'w' ? 0 : 7; // rank 1 or rank 8
  const forwardDir = victimColor === 'w' ? 1 : -1;

  // Find the king.
  let king: string | null = null;
  for (const p of board.values()) {
    if (p.color === victimColor && p.type === 'k') {
      king = p.square;
      break;
    }
  }
  if (!king) return [];

  const [kf, kr] = fileRank(king);
  if (kr !== homeRankIdx) return [];

  // Escape squares one rank forward (the king isn't castling into open air).
  const forwardSquares = [kf - 1, kf, kf + 1]
    .map((f) => toSquare(f, kr + forwardDir))
    .filter((s): s is string => s !== null);

  const allBlocked = forwardSquares.every((s) => {
    const p = board.get(s);
    return p && p.color === victimColor; // own piece blocks escape
  });
  if (!allBlocked) return [];

  // Opponent needs a heavy piece to exploit it.
  const attacker: Color = victimColor === 'w' ? 'b' : 'w';
  const hasHeavy = [...board.values()].some(
    (p) => p.color === attacker && (p.type === 'r' || p.type === 'q')
  );
  if (!hasHeavy) return [];

  return [
    {
      motif: 'backrank',
      square: king,
      value: 0,
      detail: 'the back rank is loose',
    },
  ];
}
