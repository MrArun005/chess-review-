import { describe, it, expect } from 'vitest';
import { gameAccuracy } from './accuracy';

describe('gameAccuracy', () => {
  it('is 100 for a flawless game', () => {
    expect(gameAccuracy([100, 100, 100])).toBeCloseTo(100, 5);
  });

  it('is 100 for an empty move list', () => {
    expect(gameAccuracy([])).toBe(100);
  });

  it('punishes a single disaster harder than the plain mean', () => {
    const accs = [100, 100, 100, 100, 0];
    const mean = accs.reduce((a, b) => a + b, 0) / accs.length; // 80
    expect(gameAccuracy(accs)).toBeLessThan(mean);
  });

  it('stays within [0, 100]', () => {
    const r = gameAccuracy([90, 10, 55, 0, 100]);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });

  it('accepts volatility weighting without blowing up', () => {
    const accs = [95, 80, 60, 40];
    const wins = [55, 60, 45, 30];
    const r = gameAccuracy(accs, wins);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(100);
  });
});
