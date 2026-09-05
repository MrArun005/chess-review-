import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { extractFacts } from './facts';
import { explain } from './engine';
import type { PvLine } from '../engine/types';

const line = (pv: string[], cp: number): PvLine => ({ multipv: 1, depth: 16, cp, mate: null, pv });

describe('missed material insight', () => {
  it('fires when the best move wins a pawn the played move gave up', () => {
    // Black's e5 pawn is undefended; White can win it with Nxe5 but plays Nc3.
    const fenBefore = 'rnbqkb1r/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1';
    const c = new Chess(fenBefore);
    c.move('Nc3');
    const fenAfter = c.fen();

    const facts = extractFacts({
      fenBefore,
      playedUci: 'b1c3',
      fenAfter,
      bestLine: line(['f3e5'], 100), // Nxe5 wins the pawn
      afterLine: line(['b8c6'], 0), // quiet reply, no material
      winBefore: 60,
      winAfter: 52,
    });

    expect(facts.missedGain).toBeGreaterThanOrEqual(1);
    const ex = explain(facts, fenBefore);
    expect(ex.some((e) => e.ruleId === 'missed-material')).toBe(true);
  });

  it('does not fire when the played move already wins the material', () => {
    const fenBefore = 'rnbqkb1r/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1';
    const c = new Chess(fenBefore);
    c.move('Nxe5');
    const fenAfter = c.fen();
    const facts = extractFacts({
      fenBefore,
      playedUci: 'f3e5',
      fenAfter,
      bestLine: line(['f3e5'], 100),
      afterLine: line(['b8c6'], 0),
      winBefore: 60,
      winAfter: 60,
    });
    expect(facts.missedGain).toBe(0);
  });
});
