import { describe, it, expect } from 'vitest';
import {
  parseInfoLine,
  normalizeToWhite,
  isBestmove,
  parseBestmove,
} from './uci';

describe('parseInfoLine', () => {
  it('parses a real cp info line', () => {
    const raw = parseInfoLine(
      'info depth 20 seldepth 28 multipv 1 score cp -24 nodes 1234567 nps 900000 time 137 pv e2e4 e7e5 g1f3 b8c6'
    );
    expect(raw).not.toBeNull();
    expect(raw!.depth).toBe(20);
    expect(raw!.multipv).toBe(1);
    expect(raw!.cpStm).toBe(-24);
    expect(raw!.mateStm).toBeNull();
    expect(raw!.pv).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  });

  it('parses a mate score into the mate branch, not cp', () => {
    const raw = parseInfoLine('info depth 15 multipv 1 score mate 3 pv d1h5 g6h5 h1h5');
    expect(raw!.mateStm).toBe(3);
    expect(raw!.cpStm).toBeNull();
  });

  it('parses negative mate (getting mated)', () => {
    const raw = parseInfoLine('info depth 12 multipv 2 score mate -2 pv e1e2 d8d2');
    expect(raw!.mateStm).toBe(-2);
    expect(raw!.multipv).toBe(2);
  });

  it('returns null for info lines without a pv', () => {
    expect(parseInfoLine('info depth 1 seldepth 1 nodes 20 nps 20000 string foo')).toBeNull();
    expect(parseInfoLine('info string NNUE evaluation using nn-xxx.nnue')).toBeNull();
  });
});

describe('normalizeToWhite', () => {
  it('keeps the sign when White is to move', () => {
    const raw = parseInfoLine('info depth 20 multipv 1 score cp 30 pv e2e4')!;
    const line = normalizeToWhite(raw, 'w');
    expect(line.cp).toBe(30);
  });

  it('flips the sign when Black is to move', () => {
    // +50 for the side to move (Black) means -50 for White.
    const raw = parseInfoLine('info depth 20 multipv 1 score cp 50 pv e7e5')!;
    const line = normalizeToWhite(raw, 'b');
    expect(line.cp).toBe(-50);
  });

  it('flips mate distance for Black to move', () => {
    const raw = parseInfoLine('info depth 10 multipv 1 score mate 2 pv d8h4')!;
    const line = normalizeToWhite(raw, 'b');
    // Black mates in 2 -> from White POV that's mate -2.
    expect(line.mate).toBe(-2);
  });
});

describe('bestmove', () => {
  it('detects and parses bestmove lines', () => {
    expect(isBestmove('bestmove e2e4 ponder e7e5')).toBe(true);
    expect(parseBestmove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestmove('bestmove (none)')).toBeNull();
    expect(isBestmove('info depth 3 pv e2e4')).toBe(false);
  });
});
