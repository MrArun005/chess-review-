import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Analysis } from './types';

/** Cache entry = the analysis plus a last-touch timestamp for LRU eviction. */
interface CacheEntry {
  a: Analysis;
  t: number;
}

interface ChessReviewDB extends DBSchema {
  analysis: {
    key: string; // the FEN — one entry per position, keeping the deepest analysis
    value: CacheEntry;
    indexes: { ts: number };
  };
}

const DB_NAME = 'chess-review';
const DB_VERSION = 3;

// Keep the cache bounded: trim back to LOW_WATER once it exceeds HIGH_WATER.
const HIGH_WATER = 15000;
const LOW_WATER = 12000;

let dbPromise: Promise<IDBPDatabase<ChessReviewDB>> | null = null;

function db(): Promise<IDBPDatabase<ChessReviewDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ChessReviewDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        // v1 stored raw Analysis values with no timestamp; v2 keyed by
        // fen|depth|multipv so a deeper result never satisfied a shallower
        // request. Recreate the store on any upgrade.
        if (oldVersion > 0 && database.objectStoreNames.contains('analysis')) {
          database.deleteObjectStore('analysis');
        }
        const store = database.createObjectStore('analysis');
        store.createIndex('ts', 't');
      },
    });
  }
  return dbPromise;
}

/** Cache key: the position. Depth and line count live on the stored analysis. */
export function cacheKey(fen: string): string {
  return fen;
}

/** Does a stored analysis satisfy a request? Deeper and wider both do. */
export function satisfies(a: Analysis, depth: number, multipv: number): boolean {
  return a.depth >= depth && a.lines.length >= multipv;
}

/**
 * A cached analysis at least as deep and with at least as many lines as asked
 * for. Mobile (depth 10/14) and desktop (12/18) therefore share entries, and a
 * deep pass result serves later shallow scans. A hit refreshes the entry's
 * timestamp so eviction is genuinely least-recently-USED.
 */
export async function getCached(
  fen: string,
  depth: number,
  multipv: number
): Promise<Analysis | undefined> {
  try {
    const database = await db();
    const key = cacheKey(fen);
    const entry = await database.get('analysis', key);
    if (!entry || !satisfies(entry.a, depth, multipv)) return undefined;
    void database.put('analysis', { a: entry.a, t: Date.now() }, key).catch(() => {});
    return entry.a;
  } catch {
    // IndexedDB can be unavailable (private mode, etc.). Degrade to no cache.
    return undefined;
  }
}

/** Store an analysis unless the cache already holds a better one for that position. */
export async function putCached(analysis: Analysis): Promise<void> {
  try {
    const database = await db();
    const key = cacheKey(analysis.fen);
    const existing = await database.get('analysis', key);
    if (existing && !satisfies(analysis, existing.a.depth, existing.a.lines.length)) return;
    await database.put('analysis', { a: analysis, t: Date.now() }, key);
    await evictIfNeeded(database);
  } catch {
    /* ignore cache write failures */
  }
}

/** Drop the oldest entries once the store grows past the high-water mark. */
async function evictIfNeeded(database: IDBPDatabase<ChessReviewDB>): Promise<void> {
  const count = await database.count('analysis');
  if (count <= HIGH_WATER) return;

  const tx = database.transaction('analysis', 'readwrite');
  let remaining = count - LOW_WATER;
  let cursor = await tx.store.index('ts').openCursor(); // oldest first
  while (cursor && remaining > 0) {
    await cursor.delete();
    remaining--;
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Wipe the analysis cache (useful from a settings/dev menu). */
export async function clearCache(): Promise<void> {
  try {
    await (await db()).clear('analysis');
  } catch {
    /* ignore */
  }
}
