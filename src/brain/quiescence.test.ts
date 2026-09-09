import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { materialSwing } from './facts';

// 1.e4 e5 2.Nf3 Nc6 — e5 is defended by the knight on c6.
const fen = (() => { const c = new Chess(); ['e4','e5','Nf3','Nc6'].forEach((m) => c.move(m)); return c.fen(); })();

describe('materialSwing quiescence', () => {
  it('does not count a capture the opponent can immediately recapture', () => {
    // PV cut off after Nxe5: naive diff says White is +1.
    expect(materialSwing(fen, ['f3e5'], 'w')).toBe(0);
  });
  it('counts the exchange once the PV reaches a quiet position', () => {
    expect(materialSwing(fen, ['f3e5', 'c6e5'], 'w')).toBe(-2);
  });
});
