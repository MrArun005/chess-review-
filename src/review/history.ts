import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ReviewResult } from './pipeline';
import { gameAccuracy } from './accuracy';

/**
 * Local "My Games" history. Every reviewed game is saved to IndexedDB (its own
 * database, separate from the engine cache) so it can be reopened instantly —
 * no re-analysis, works offline, never leaves the device.
 */

export interface SavedGameMeta {
  id: string;
  savedAt: number;
  white: string;
  black: string;
  result: string;
  date: string;
  opening: string | null;
  whiteAcc: number;
  blackAcc: number;
  moveCount: number;
  source: string;
}

interface StoredGame extends SavedGameMeta {
  pgn: string;
  review: ReviewResult;
}

interface HistoryDB extends DBSchema {
  games: {
    key: string;
    value: StoredGame;
    indexes: { savedAt: number };
  };
}

const DB_NAME = 'chess-review-history';
const DB_VERSION = 1;
const MAX_GAMES = 60;

let dbPromise: Promise<IDBPDatabase<HistoryDB>> | null = null;

function db(): Promise<IDBPDatabase<HistoryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HistoryDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore('games', { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt');
      },
    });
  }
  return dbPromise;
}

/** Stable id from the PGN so re-reviewing a game updates rather than duplicates. */
function hashId(pgn: string): string {
  let h = 2166136261;
  for (let i = 0; i < pgn.length; i++) {
    h ^= pgn.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'g' + (h >>> 0).toString(36);
}

function accuracies(result: ReviewResult): { w: number; b: number } {
  const w = result.moves.filter((m) => m.color === 'w');
  const b = result.moves.filter((m) => m.color === 'b');
  return {
    w: Math.round(gameAccuracy(w.map((m) => m.accuracy), w.map((m) => m.winMoverBefore))),
    b: Math.round(gameAccuracy(b.map((m) => m.accuracy), b.map((m) => m.winMoverBefore))),
  };
}

export async function saveGame(result: ReviewResult, pgn: string, source = 'pgn'): Promise<void> {
  try {
    const h = result.headers;
    const acc = accuracies(result);
    const entry: StoredGame = {
      id: hashId(pgn),
      savedAt: Date.now(),
      white: h.White ?? 'White',
      black: h.Black ?? 'Black',
      result: h.Result ?? '*',
      date: h.Date ?? '',
      opening: result.openingName,
      whiteAcc: acc.w,
      blackAcc: acc.b,
      moveCount: result.moves.length,
      source,
      pgn,
      review: result,
    };
    const database = await db();
    await database.put('games', entry);
    // Evict oldest beyond the cap.
    const count = await database.count('games');
    if (count > MAX_GAMES) {
      const tx = database.transaction('games', 'readwrite');
      let cursor = await tx.store.index('savedAt').openCursor();
      let toDelete = count - MAX_GAMES;
      while (cursor && toDelete > 0) {
        await cursor.delete();
        toDelete--;
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export async function listGames(): Promise<SavedGameMeta[]> {
  try {
    const database = await db();
    const all = await database.getAllFromIndex('games', 'savedAt');
    return all
      .sort((a, b) => b.savedAt - a.savedAt)
      .map(({ pgn: _pgn, review: _review, ...meta }) => meta);
  } catch {
    return [];
  }
}

export async function getGame(id: string): Promise<StoredGame | null> {
  try {
    return (await (await db()).get('games', id)) ?? null;
  } catch {
    return null;
  }
}

export async function deleteGame(id: string): Promise<void> {
  try {
    await (await db()).delete('games', id);
  } catch {
    /* ignore */
  }
}

export async function clearGames(): Promise<void> {
  try {
    await (await db()).clear('games');
  } catch {
    /* ignore */
  }
}
