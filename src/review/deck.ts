import type { Puzzle } from './puzzles';

/**
 * Spaced-repetition deck of your blunder puzzles. Every reviewed game feeds its
 * mistakes into a persistent deck; each card resurfaces on a Leitner schedule
 * (10 min → 1 → 3 → 7 → 16 → 35 days) — get it right first try and it moves up a
 * box, miss it and it resets. All in localStorage: offline, private, no server.
 */

export interface DeckCard extends Puzzle {
  id: string;
  box: number;
  due: number;
  addedAt: number;
}

const KEY = 'cr-deck-v1';
const MAX = 300;
const DAY = 24 * 3600 * 1000;
const INTERVALS = [10 * 60 * 1000, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];

function cardId(p: Puzzle): string {
  const s = p.fen + '|' + p.solutionUci;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'p' + (h >>> 0).toString(36);
}

function load(): DeckCard[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeckCard[]) : [];
  } catch {
    return [];
  }
}

function save(cards: DeckCard[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cards));
  } catch {
    /* ignore */
  }
}

/** Add a game's puzzles to the deck (deduped); due immediately. */
export function addPuzzles(puzzles: Puzzle[]): void {
  if (puzzles.length === 0) return;
  const cards = load();
  const have = new Set(cards.map((c) => c.id));
  const now = Date.now();
  for (const p of puzzles) {
    const id = cardId(p);
    if (have.has(id)) continue;
    have.add(id);
    cards.push({ ...p, id, box: 0, due: now, addedAt: now });
  }
  // Cap: drop the oldest-added mastered cards first, else oldest.
  if (cards.length > MAX) {
    cards.sort((a, b) => b.box - a.box || a.addedAt - b.addedAt);
    cards.length = MAX;
  }
  save(cards);
}

export function dueCards(limit = 20): DeckCard[] {
  const now = Date.now();
  return load()
    .filter((c) => c.due <= now)
    .sort((a, b) => a.due - b.due)
    .slice(0, limit);
}

export interface DeckStats {
  total: number;
  due: number;
  mastered: number;
}

export function deckStats(): DeckStats {
  const now = Date.now();
  const cards = load();
  return {
    total: cards.length,
    due: cards.filter((c) => c.due <= now).length,
    mastered: cards.filter((c) => c.box >= 4).length,
  };
}

/** Grade a card after an attempt and reschedule it. */
export function grade(id: string, correct: boolean): void {
  const cards = load();
  const c = cards.find((x) => x.id === id);
  if (!c) return;
  c.box = correct ? Math.min(c.box + 1, INTERVALS.length - 1) : 0;
  c.due = Date.now() + INTERVALS[c.box];
  save(cards);
}

export function clearDeck(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
