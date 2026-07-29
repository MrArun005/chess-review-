import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Analysis } from './types';

interface ChessReviewDB extends DBSchema {
  analysis: {
    key: string; // `${fen}|${depth}|${multipv}`
    value: Analysis;
  };
}

const DB_NAME = 'chess-review';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ChessReviewDB>> | null = null;

function db(): Promise<IDBPDatabase<ChessReviewDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ChessReviewDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('analysis')) {
          database.createObjectStore('analysis');
        }
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
    return await (await db()).get('analysis', cacheKey(fen, depth, multipv));
  } catch {
    // IndexedDB can be unavailable (private mode, etc.). Degrade to no cache.
    return undefined;
  }
}

export async function putCached(
  analysis: Analysis,
  multipv: number
): Promise<void> {
  try {
    await (await db()).put(
      'analysis',
      analysis,
      cacheKey(analysis.fen, analysis.depth, multipv)
    );
  } catch {
    /* ignore cache write failures */
  }
}

/** Wipe the analysis cache (useful from a settings/dev menu). */
export async function clearCache(): Promise<void> {
  try {
    await (await db()).clear('analysis');
  } catch {
    /* ignore */
  }
}
