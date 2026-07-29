import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Analysis } from './types';

/** Cache entry = the analysis plus a last-touch timestamp for LRU eviction. */
interface CacheEntry {
  a: Analysis;
  t: number;
}

interface ChessReviewDB extends DBSchema {
  analysis: {
    key: string; // `${fen}|${depth}|${multipv}`
    value: CacheEntry;
    indexes: { ts: number };
  };
}

const DB_NAME = 'chess-review';
const DB_VERSION = 2;

// Keep the cache bounded: trim back to LOW_WATER once it exceeds HIGH_WATER.
const HIGH_WATER = 15000;
const LOW_WATER = 12000;

let dbPromise: Promise<IDBPDatabase<ChessReviewDB>> | null = null;

function db(): Promise<IDBPDatabase<ChessReviewDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ChessReviewDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        // v1 stored raw Analysis values with no timestamp; recreate the store
        // so every entry carries one for eviction.
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

/** Cache key for a position analyzed at a given depth/multipv. */
export function cacheKey(fen: string, depth: number, multipv: number): string {
  return `${fen}|${depth}|${multipv}`;
}

export async function getCached(
  fen: string,
  depth: number,
  multipv: number
): Promise<Analysis | undefined> {
  try {
    const entry = await (await db()).get('analysis', cacheKey(fen, depth, multipv));
    return entry?.a;
  } catch {
    // IndexedDB can be unavailable (private mode, etc.). Degrade to no cache.
    return undefined;
  }
}

export async function putCached(analysis: Analysis, multipv: number): Promise<void> {
  try {
    const database = await db();
    await database.put(
      'analysis',
      { a: analysis, t: Date.now() },
      cacheKey(analysis.fen, analysis.depth, multipv)
    );
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
