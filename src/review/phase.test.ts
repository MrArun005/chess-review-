import { describe, it, expect } from 'vitest';
import { phaseOf } from './phase';

describe('phaseOf', () => {
  it('calls the starting position the opening', () => {
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('opening');
  });

  it('calls a full board past move 12 the middlegame', () => {
    expect(
      phaseOf('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 20')
    ).toBe('middlegame');
  });

  it('calls a bare king-and-pawn position the endgame', () => {
    expect(phaseOf('k7/8/8/8/8/8/4P3/K7 w - - 0 40')).toBe('endgame');
  });

  it('treats a queenless, low-material position as endgame even early', () => {
    // Only kings and a rook each — clearly an endgame regardless of move number.
    expect(phaseOf('4k3/8/8/8/8/8/r7/4K2R w K - 0 8')).toBe('endgame');
  });
});
