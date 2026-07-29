import { PIECE_VALUE, type Color, type BoardMap } from '../attacks';
import { alignments } from './pin';
import type { MotifHit } from './types';

const NAME: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/**
 * A skewer: the reverse of a pin. The front (nearer) piece is worth MORE than
 * the rear piece, so when it moves out of the way the slider wins the rear
 * piece behind it.
 */
export function detectSkewer(board: BoardMap, byColor: Color): MotifHit[] {
  const hits: MotifHit[] = [];
  for (const { slider, front, rear } of alignments(board, byColor)) {
    // King in front is the classic skewer (king must move, rear falls).
    const frontMoreValuable =
      front.type === 'k' || PIECE_VALUE[front.type] > PIECE_VALUE[rear.type];
    if (frontMoreValuable) {
      hits.push({
        motif: 'skewer',
        square: slider.square,
        targets: [front.square, rear.square],
        value: PIECE_VALUE[rear.type],
        detail: `${NAME[front.type]} skewered, winning the ${NAME[rear.type]}`,
      });
    }
  }
  return hits.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}
