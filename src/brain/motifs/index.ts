import type { Color, BoardMap } from '../attacks';
import { detectHanging } from './hanging';
import { detectFork } from './fork';
import { detectPin } from './pin';
import { detectSkewer } from './skewer';
import { detectBackrank } from './backrank';
import { detectTrapped } from './trapped';
import type { MotifHit } from './types';

export * from './types';
export { detectHanging, detectFork, detectPin, detectSkewer, detectBackrank, detectTrapped };

/**
 * Run every motif detector for a threat created by `byColor` against the other
 * side, returning all hits sorted by material at stake (biggest first).
 *
 * `focus` narrows fork detection to the piece that just moved.
 */
export function detectAll(
  board: BoardMap,
  byColor: Color,
  focus?: string
): MotifHit[] {
  const victim: Color = byColor === 'w' ? 'b' : 'w';
  const hits: MotifHit[] = [
    ...detectFork(board, byColor, focus),
    ...detectPin(board, byColor),
    ...detectSkewer(board, byColor),
    ...detectHanging(board, victim),
    ...detectTrapped(board, victim),
    ...detectBackrank(board, victim),
  ];
  return hits.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}
