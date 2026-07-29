import { describe, it, expect } from 'vitest';
import { terminalWinWhite } from './pipeline';

describe('terminalWinWhite', () => {
  it('scores a position where White is checkmated as 0', () => {
    // Fool's mate: 1. f3 e5 2. g4 Qh4# — White (to move) is mated.
    expect(
      terminalWinWhite('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')
    ).toBe(0);
  });

  it('scores a position where Black is checkmated as 100', () => {
    // Scholar's mate: ...Qxf7#, Black (to move) is mated.
    expect(
      terminalWinWhite('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4')
    ).toBe(100);
  });

  it('scores a stalemate as 50', () => {
    // Black to move, king on a8 has no legal move and is not in check.
    expect(terminalWinWhite('k7/8/1Q6/8/8/8/8/7K b - - 0 1')).toBe(50);
  });

  it('returns null for a live position', () => {
    expect(terminalWinWhite('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBeNull();
  });
});
