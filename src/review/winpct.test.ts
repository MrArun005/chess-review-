import { describe, it, expect } from 'vitest';
import { winPct, winPctForMover, winPctWhite, moveAccuracy, clamp } from './winpct';
import type { PvLine } from '../engine/types';

const line = (cp: number | null, mate: number | null = null): PvLine => ({
  multipv: 1,
  depth: 20,
  cp,
  mate,
  pv: [],
});

describe('winPct', () => {
  it('is 50% at a level position', () => {
    expect(winPct(0)).toBeCloseTo(50, 5);
  });

  it('is symmetric around 50', () => {
    expect(winPct(300) + winPct(-300)).toBeCloseTo(100, 5);
  });

  it('increases monotonically with cp', () => {
    expect(winPct(100)).toBeGreaterThan(winPct(0));
    expect(winPct(500)).toBeGreaterThan(winPct(100));
  });

  it('clamps extreme evals', () => {
    expect(winPct(5000)).toBeCloseTo(winPct(1000), 5);
    expect(winPct(-5000)).toBeCloseTo(winPct(-1000), 5);
  });
});

describe('winPctWhite / winPctForMover', () => {
  it('saturates mate to 100 / 0 from White POV', () => {
    expect(winPctWhite(line(null, 3))).toBe(100);
    expect(winPctWhite(line(null, -3))).toBe(0);
  });

  it('flips perspective for the side to move', () => {
    // +200 for White. If Black is to move, that's bad for Black.
    expect(winPctForMover(line(200), 'w')).toBeGreaterThan(50);
    expect(winPctForMover(line(200), 'b')).toBeLessThan(50);
  });

  it('handles mate for the mover', () => {
    // White mates in 2; if White to move, mover win% = 100.
    expect(winPctForMover(line(null, 2), 'w')).toBe(100);
    // Same line but Black to move -> White mating is 0 for Black.
    expect(winPctForMover(line(null, 2), 'b')).toBe(0);
  });
});

describe('moveAccuracy', () => {
  it('is ~100 when nothing is lost', () => {
    expect(moveAccuracy(60, 60)).toBeGreaterThan(99);
  });

  it('collapses for a big win% drop', () => {
    expect(moveAccuracy(80, 20)).toBeLessThan(15);
  });

  it('is bounded to [0, 100]', () => {
    expect(moveAccuracy(100, 0)).toBeGreaterThanOrEqual(0);
    expect(moveAccuracy(0, 100)).toBeLessThanOrEqual(100);
  });
});

describe('clamp', () => {
  it('bounds values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});
