/**
 * Loads the static puzzle pack from public/puzzles (built by
 * scripts/build-puzzles.mjs). Files are fetched lazily per 200-point rating
 * band and memoised, so a session only downloads the bands it needs.
 */
import { decode, type LPuzzle, type PackRow } from './line';

export const BAND = 200;
export const MIN_BAND = 400;
export const MAX_BAND = 2800;

export const bandOf = (r: number) => Math.min(MAX_BAND, Math.max(MIN_BAND, Math.floor(r / BAND) * BAND));

const cache = new Map<string, Promise<LPuzzle[]>>();

function load(name: string): Promise<LPuzzle[]> {
  let p = cache.get(name);
  if (!p) {
    const base = import.meta.env.BASE_URL ?? '/';
    p = fetch(`${base}puzzles/${name}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`puzzle pack ${name}: HTTP ${r.status}`);
        return r.json() as Promise<PackRow[]>;
      })
      .then((rows) => rows.map(decode));
    // A failed fetch (offline, 404) must not poison the cache for a retry.
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

/** Every puzzle in the bands overlapping [target - spread, target + spread]. */
export async function loadAround(target: number, spread = 200): Promise<LPuzzle[]> {
  const bands: number[] = [];
  for (let b = bandOf(target - spread); b <= bandOf(target + spread); b += BAND) bands.push(b);
  const parts = await Promise.all(bands.map((b) => load(String(b))));
  return parts.flat();
}

export const loadDaily = () => load('daily');
export const loadMaster = () => load('master');
