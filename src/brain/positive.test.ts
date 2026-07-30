import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { explainStrength } from './positive';

/** Helper: play a UCI move and return the resulting FEN. */
function after(fen: string, uci: string): string {
  const c = new Chess(fen);
  c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never });
  return c.fen();
}

describe('explainStrength', () => {
  it('praises a move that creates a fork', () => {
    const before = 'r3k3/8/4N3/8/8/8/8/7K w - - 0 1';
    const uci = 'e6c7'; // Nc7+ forks the king on e8 and rook on a8
    const ex = explainStrength(before, uci, after(before, uci), 'best');
    expect(ex.length).toBe(1);
    expect(ex[0].text.toLowerCase()).toContain('fork');
  });

  it('gives Brilliant moves a sacrifice-themed note', () => {
    const before = 'r3k3/8/4N3/8/8/8/8/7K w - - 0 1';
    const uci = 'e6c7';
    const ex = explainStrength(before, uci, after(before, uci), 'brilliant');
    expect(ex[0].text.toLowerCase()).toContain('brilliant');
  });

  it('does not credit a pre-existing pin to an unrelated move', () => {
    // Bb5 already pins the c6 knight to the king; White then just shuffles the
    // king. The praise must NOT claim the move created the pin.
    const before = '4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1';
    const uci = 'e1e2';
    const ex = explainStrength(before, uci, after(before, uci), 'best');
    expect(ex.every((e) => !/pin/i.test(e.text))).toBe(true);
  });

  it('stays silent on book and forced moves', () => {
    const before = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(explainStrength(before, 'e2e4', after(before, 'e2e4'), 'book')).toEqual([]);
    expect(explainStrength(before, 'e2e4', after(before, 'e2e4'), 'forced')).toEqual([]);
  });
});
