import { clamp } from './winpct';

/**
 * Game-level accuracy for one side.
 *
 * We blend the arithmetic mean of per-move accuracies with their harmonic
 * mean. The harmonic term punishes a single disaster harder than the mean
 * does — which matches how chess.com's number "feels": one blunder should
 * visibly dent your accuracy even in an otherwise clean game.
 *
 * An optional volatility weighting emphasises moves played in sharp positions
 * (where a mistake matters more) over quiet ones. Pass per-move win% (mover
 * POV) to enable it; omit for the simple blend.
 */
export function gameAccuracy(
  moveAccuracies: number[],
  winPctSeries?: number[]
): number {
  if (moveAccuracies.length === 0) return 100;

  const weights = winPctSeries
    ? volatilityWeights(winPctSeries, moveAccuracies.length)
    : moveAccuracies.map(() => 1);

  const arithmetic = weightedMean(moveAccuracies, weights);
  const harmonic = weightedHarmonicMean(moveAccuracies, weights);

  // 50/50 blend. Clamp for safety.
  return clamp((arithmetic + harmonic) / 2, 0, 100);
}

/**
 * Position volatility from the std-dev of win% over a sliding window. Moves in
 * volatile stretches get more weight.
 */
export function volatilityWeights(
  winPctSeries: number[],
  count: number,
  window = 8
): number[] {
  const weights: number[] = [];
  for (let i = 0; i < count; i++) {
    const lo = Math.max(0, i - Math.floor(window / 2));
    const hi = Math.min(winPctSeries.length, lo + window);
    const slice = winPctSeries.slice(lo, hi);
    const sd = stdDev(slice);
    // Baseline 1 so quiet moves still count; volatility adds up to ~+1.
    weights.push(1 + clamp(sd / 25, 0, 1));
  }
  return weights;
}

function weightedMean(values: number[], weights: number[]): number {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i] ?? 1;
    sum += values[i] * w;
    wsum += w;
  }
  return wsum === 0 ? 0 : sum / wsum;
}

function weightedHarmonicMean(values: number[], weights: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i] ?? 1;
    // Guard against divide-by-zero; a 0-accuracy move is a hard floor.
    const v = Math.max(values[i], 1e-3);
    num += w;
    den += w / v;
  }
  return den === 0 ? 0 : num / den;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance =
    xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length;
  return Math.sqrt(variance);
}
