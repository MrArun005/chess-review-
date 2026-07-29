import type { PvLine } from '../engine/types';

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x));

/**
 * Win probability (0-100) for the side to move, given a centipawn eval from
 * that side's perspective. Clamp cp to +/-1000 first.
 *
 * This is why a 200cp drop is "good" when you're up a queen but a "blunder"
 * when the game is level — win% is non-linear in cp. Classify on win%, never
 * on raw centipawns.
 */
export function winPct(cp: number): number {
  const c = clamp(cp, -1000, 1000);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/**
 * Win% for the side to move from a PV line (White-normalized cp/mate).
 * Mate is saturated: mate for the side-to-move -> 100, mate against -> 0.
 *
 * @param line       PV line with White-perspective cp/mate.
 * @param sideToMove whose move it is in the position the line was computed for.
 */
export function winPctForMover(line: PvLine, sideToMove: 'w' | 'b'): number {
  const sign = sideToMove === 'w' ? 1 : -1;
  if (line.mate !== null) {
    // Positive mate (White POV) is good for White. Convert to mover POV.
    const moverMate = line.mate * sign;
    return moverMate > 0 ? 100 : 0;
  }
  const moverCp = (line.cp ?? 0) * sign;
  return winPct(moverCp);
}

/** Win% from White's perspective (for the eval bar / graph). */
export function winPctWhite(line: PvLine): number {
  if (line.mate !== null) return line.mate > 0 ? 100 : 0;
  return winPct(line.cp ?? 0);
}

/**
 * Per-move accuracy (0-100) from the moving player's win% before and after
 * their move. Both args are win% from the MOVER's perspective.
 *
 * Chess.com's published curve: a small drop stays near 100, a large drop
 * collapses fast.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  return clamp(
    103.1668 * Math.exp(-0.04354 * (winBefore - winAfter)) - 3.1669,
    0,
    100
  );
}
