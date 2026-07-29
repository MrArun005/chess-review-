import { Chess } from 'chess.js';
import { boardMap, PIECE_VALUE } from '../brain/attacks';

export type Phase = 'opening' | 'middlegame' | 'endgame';

export const PHASE_LABEL: Record<Phase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
};

/**
 * Classify a position's game phase from material and move number.
 *
 * - Endgame: little non-pawn material left (roughly a rook + minor each side or
 *   less), or queens traded with few pieces remaining.
 * - Opening: the first dozen moves, before the endgame threshold.
 * - Middlegame: everything else.
 *
 * Starting non-pawn material is 62; the endgame threshold of 20 corresponds to
 * both sides being down to about a rook and a minor piece.
 */
export function phaseOf(fen: string): Phase {
  const board = boardMap(new Chess(fen));
  let nonPawn = 0;
  let queens = 0;
  let majorMinor = 0;
  for (const p of board.values()) {
    if (p.type === 'k' || p.type === 'p') continue;
    nonPawn += PIECE_VALUE[p.type];
    if (p.type === 'q') queens++;
    majorMinor++;
  }
  const fullmove = Number(fen.split(/\s+/)[5]) || 1;

  if (nonPawn <= 20 || (queens === 0 && majorMinor <= 4)) return 'endgame';
  if (fullmove <= 12) return 'opening';
  return 'middlegame';
}
