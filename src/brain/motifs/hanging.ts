import { attackersOf, defendersOf, cheapestAttacker, PIECE_VALUE, type Color, type BoardMap } from '../attacks';
import type { MotifHit } from './types';

const NAME: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/**
 * Find pieces of `victimColor` that are hanging: attacked by the opponent and
 * either undefended, or defended but the cheapest attacker is worth less than
 * the piece (so the opponent wins material by taking it).
 *
 * Returns hits sorted by value at stake, biggest first.
 */
export function detectHanging(board: BoardMap, victimColor: Color): MotifHit[] {
  const attacker: Color = victimColor === 'w' ? 'b' : 'w';
  const hits: MotifHit[] = [];

  for (const piece of board.values()) {
    if (piece.color !== victimColor) continue;
    if (piece.type === 'k') continue; // kings can't hang

    const attackers = attackersOf(board, piece.square, attacker);
    if (attackers.length === 0) continue;

    const defenders = defendersOf(board, piece.square);
    const value = PIECE_VALUE[piece.type];
    const cheapest = cheapestAttacker(attackers);

    const undefended = defenders.length === 0;
    // Even if defended, if the cheapest attacker is worth strictly less than
    // the target, the opponent wins the exchange.
    const winnableExchange = cheapest < value;

    if (undefended || winnableExchange) {
      hits.push({
        motif: 'hanging',
        square: piece.square,
        value,
        detail: NAME[piece.type],
      });
    }
  }

  return hits.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}
