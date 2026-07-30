import { attackersOf, defendersOf, PIECE_VALUE, type Color, type BoardMap } from '../attacks';
import type { MotifHit } from './types';

const NAME: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/**
 * Detect a fork by `byColor`: a single piece simultaneously attacking two or
 * more enemy targets that it "wins" on — a target is winnable if it is worth
 * more than the forking piece, or it is undefended, or it is the king (check).
 *
 * If `focus` is given, only that piece is considered the forker (useful right
 * after a move to check what the just-moved piece forks).
 */
export function detectFork(
  board: BoardMap,
  byColor: Color,
  focus?: string
): MotifHit[] {
  const victim: Color = byColor === 'w' ? 'b' : 'w';
  const hits: MotifHit[] = [];

  for (const piece of board.values()) {
    if (piece.color !== byColor) continue;
    if (focus && piece.square !== focus) continue;

    const forkerValue = PIECE_VALUE[piece.type];
    const targets: { square: string; value: number; name: string }[] = [];
    let givesCheck = false;

    for (const enemy of board.values()) {
      if (enemy.color !== victim) continue;
      // Does `piece` attack `enemy`?
      const attackers = attackersOf(board, enemy.square, byColor);
      if (!attackers.some((a) => a.square === piece.square)) continue;

      const targetValue = PIECE_VALUE[enemy.type];
      const undefended = defendersOf(board, enemy.square).length === 0;
      const isKing = enemy.type === 'k';
      const winnable = isKing || targetValue > forkerValue || undefended;
      if (winnable) {
        if (isKing) givesCheck = true;
        targets.push({ square: enemy.square, value: targetValue, name: NAME[enemy.type] });
      }
    }

    // A "fork" whose own piece hangs for free isn't a real threat — unless it's
    // a check (the opponent must respond before capturing the forker).
    if (!givesCheck) {
      const enemyAttackers = attackersOf(board, piece.square, victim);
      const defended = defendersOf(board, piece.square).length > 0;
      const forkerHangs =
        enemyAttackers.length > 0 &&
        !defended &&
        enemyAttackers.some((a) => PIECE_VALUE[a.type] < forkerValue);
      if (forkerHangs) continue;
    }

    if (targets.length >= 2) {
      targets.sort((a, b) => b.value - a.value);
      const top = targets.slice(0, 3);
      hits.push({
        motif: 'fork',
        square: piece.square,
        targets: top.map((t) => t.square),
        value: top.reduce((s, t) => s + t.value, 0),
        detail: top.map((t) => t.name).join(' and '),
      });
    }
  }

  return hits.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}
