import type { LPuzzle } from './line';

export type Filter = (p: LPuzzle) => boolean;

/**
 * Pick an unseen puzzle close to `target`: find the nearest unseen rating, then
 * choose at random among puzzles within 60 points of that distance. Difficulty
 * stays tight when the pool is deep and still returns something when it is
 * thin. Falls back to seen puzzles only once every candidate has been played.
 */
export function pick(
  pool: LPuzzle[],
  target: number,
  seen: ReadonlySet<string>,
  rand: () => number = Math.random,
  filter?: Filter
): LPuzzle | null {
  const ok = filter ? pool.filter(filter) : pool;
  const unseen = ok.filter((p) => !seen.has(p.id));
  const from = unseen.length ? unseen : ok;
  if (from.length === 0) return null;
  let nearest = Infinity;
  for (const p of from) nearest = Math.min(nearest, Math.abs(p.rating - target));
  const c = from.filter((p) => Math.abs(p.rating - target) <= nearest + 60);
  return c[Math.floor(rand() * c.length)];
}

/** Deterministic PRNG (mulberry32) for reproducible picks, e.g. the daily puzzle. */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The daily puzzle: the same for everyone on a given (UTC) date. */
export function dailyIndex(n: number, d = new Date()): number {
  const days = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
  return ((days % n) + n) % n;
}

/** Puzzle Rush difficulty ramp: puzzle i of a run (0-based). Fixed, so scores compare. */
export const rushTarget = (i: number) => Math.min(2800, 500 + i * 60);
