import { describe, it, expect } from 'vitest';
import { computeCaptured } from './Captured';

describe('computeCaptured', () => {
  it('start position: nothing captured, level material', () => {
    const c = computeCaptured('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(c.net).toBe(0);
    expect(c.byWhite.p).toBe(0);
    expect(c.byBlack.q).toBe(0);
  });

  it('White up a pawn: one black pawn captured, +1', () => {
    // Black is missing one pawn (7 pawns on rank 7).
    const c = computeCaptured('rnbqkbnr/ppppppp1/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(c.byWhite.p).toBe(1);
    expect(c.byBlack.p).toBe(0);
    expect(c.net).toBe(1);
  });

  it('Black up a knight: one white knight captured, -3', () => {
    // White missing the b1 knight.
    const c = computeCaptured('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1');
    expect(c.byBlack.n).toBe(1);
    expect(c.net).toBe(-3);
  });

  it('nets out equal trades to zero even with pieces off', () => {
    // Both sides missing their queen → net 0, each tray shows the enemy queen.
    const c = computeCaptured('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1');
    expect(c.byWhite.q).toBe(1);
    expect(c.byBlack.q).toBe(1);
    expect(c.net).toBe(0);
  });
});
