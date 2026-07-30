import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { boardMap } from '../attacks';
import { detectFork } from './fork';
import { detectHanging } from './hanging';
import { detectPin } from './pin';
import { detectSkewer } from './skewer';
import { detectBackrank } from './backrank';
import { detectAll } from './index';

const board = (fen: string) => boardMap(new Chess(fen));

describe('detectFork', () => {
  it('finds a knight royal fork', () => {
    const hits = detectFork(board('r3k3/2N5/8/8/8/8/8/7K b - - 0 1'), 'w');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].square).toBe('c7');
    expect(hits[0].targets).toContain('e8');
    expect(hits[0].targets).toContain('a8');
  });

  it('does not report a single attacked piece as a fork', () => {
    const hits = detectFork(board('4k3/8/5n2/4P3/8/8/8/4K3 w - - 0 1'), 'w');
    expect(hits.length).toBe(0);
  });
});

describe('detectHanging', () => {
  it('flags an undefended attacked queen', () => {
    const hits = detectHanging(board('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1'), 'b');
    expect(hits.some((h) => h.square === 'd5')).toBe(true);
  });

  it('ignores a defended piece attacked by something of equal value', () => {
    // Rook on e5 defended by rook e1, attacked by rook e8: equal trade, not hanging.
    const hits = detectHanging(board('k3r3/8/8/4R3/8/8/8/4R2K b - - 0 1'), 'w');
    expect(hits.some((h) => h.square === 'e5')).toBe(false);
  });
});

describe('detectPin', () => {
  it('finds an absolute pin against the king', () => {
    const hits = detectPin(board('4k3/8/8/4n3/8/8/8/4R2K w - - 0 1'), 'w');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].targets).toEqual(['e5', 'e8']);
  });
});

describe('detectSkewer', () => {
  it('finds a king skewer winning the piece behind', () => {
    const hits = detectSkewer(board('r7/8/8/8/k7/8/8/R6K b - - 0 1'), 'w');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].targets).toEqual(['a4', 'a8']);
  });
});

describe('detectBackrank', () => {
  it('flags a king trapped on the back rank by its own pawns', () => {
    const hits = detectBackrank(board('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1'), 'b');
    expect(hits.length).toBe(1);
    expect(hits[0].square).toBe('g8');
  });

  it('does not flag when there is an escape square', () => {
    const hits = detectBackrank(board('6k1/5pp1/7p/8/8/8/8/3R2K1 w - - 0 1'), 'b');
    expect(hits.length).toBe(0);
  });
});

describe('false-positive guards', () => {
  it('does not report back rank when the enemy heavy piece cannot reach it', () => {
    // Black king boxed in, but White's only queen is on a closed a-file (pawn
    // on a2) — it can't operate on the back rank, so this must NOT fire.
    const hits = detectBackrank(board('6k1/5ppp/8/8/8/8/P7/Q5K1 b - - 0 1'), 'b');
    expect(hits.length).toBe(0);
  });

  it('does not report a fork whose forking piece hangs for free', () => {
    // Black knight on e4 "forks" the rooks on c3 and g3, but it's attacked by
    // the d3 pawn for free and isn't giving check — not a real fork.
    const hits = detectFork(board('4k3/8/8/8/4n3/2RP2R1/8/4K3 b - - 0 1'), 'b');
    expect(hits.length).toBe(0);
  });
});

describe('detectAll', () => {
  it('aggregates motifs sorted by value at stake', () => {
    const hits = detectAll(board('r3k3/2N5/8/8/8/8/8/7K b - - 0 1'), 'w');
    expect(hits.map((h) => h.motif)).toContain('fork');
  });
});
