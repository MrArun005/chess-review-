import { fileRank, toSquare, type Color, type BoardMap } from '../attacks';
import type { MotifHit } from './types';

/**
 * Back-rank weakness for `victimColor`: their king sits on its home rank, every
 * escape square one rank forward is blocked by a friendly piece (the pawn
 * shield), AND the opponent actually has a rook/queen that can reach the back
 * rank to exploit it — already on that rank, or on an open file that leads to
 * it. Without the reachability check this fired against any random enemy queen
 * in a closed middlegame (a rampant false positive).
 *
 * This is a structural flag, not proof of forced mate — the engine's mate score
 * covers the forced case. It's what fires when a move "leaves the back rank
 * loose".
 */
export function detectBackrank(board: BoardMap, victimColor: Color): MotifHit[] {
  const homeRankIdx = victimColor === 'w' ? 0 : 7; // rank 1 or rank 8
  const forwardDir = victimColor === 'w' ? 1 : -1;

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

  // Escape squares one rank forward must all be blocked by the king's own pieces.
  const forwardSquares = [kf - 1, kf, kf + 1]
    .map((f) => toSquare(f, kr + forwardDir))
    .filter((s): s is string => s !== null);
  const allBlocked = forwardSquares.every((s) => {
    const p = board.get(s);
    return p && p.color === victimColor;
  });
  if (!allBlocked) return [];

  // The opponent needs a rook/queen that can actually operate on the back rank:
  // already there, or on a file with no pawns (so it can slide to the rank).
  const attacker: Color = victimColor === 'w' ? 'b' : 'w';
  const pawnFiles = pawnFileSet(board);
  const canReach = [...board.values()].some((p) => {
    if (p.color !== attacker || (p.type !== 'r' && p.type !== 'q')) return false;
    const [pf, pr] = fileRank(p.square);
    return pr === homeRankIdx || !pawnFiles.has(pf); // on the rank, or on an open file
  });
  if (!canReach) return [];

  return [
    {
      motif: 'backrank',
      square: king,
      // A real (rook-sized) stake so this can win motif priority and the
      // back-rank explanation rules can actually fire.
      value: 4,
      detail: 'the back rank is loose',
    },
  ];
}

/** Files (0-7) that have at least one pawn of either colour. */
function pawnFileSet(board: BoardMap): Set<number> {
  const files = new Set<number>();
  for (const p of board.values()) {
    if (p.type === 'p') files.add(fileRank(p.square)[0]);
  }
  return files;
}
