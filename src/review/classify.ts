/**
 * Move classification badges.
 *
 * Base classification fires on `drop = winPctBefore - winPctAfter`, both from
 * the mover's perspective. Special badges (forced/book/great/brilliant/miss)
 * are layered on top by the pipeline, which has the extra context they need.
 */

export type BaseClass =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export type SpecialClass =
  | 'forced'
  | 'book'
  | 'great'
  | 'brilliant'
  | 'miss';

export type MoveClass = BaseClass | SpecialClass;

/**
 * Base classification from win% drop. Thresholds are a starting point — tune
 * them in the eval harness (Phase 6) against hand-labelled games.
 */
export function classify(drop: number): BaseClass {
  if (drop <= 0) return 'best';
  if (drop < 2) return 'excellent';
  if (drop < 5) return 'good';
  if (drop < 10) return 'inaccuracy';
  if (drop < 20) return 'mistake';
  return 'blunder';
}

/** Human label for a class. */
export const CLASS_LABEL: Record<MoveClass, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  forced: 'Forced',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  miss: 'Miss',
};

/** Glyph shown next to the move in the list. */
export const CLASS_ICON: Record<MoveClass, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '✓',
  book: '📖',
  forced: '□',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  miss: '×',
};

/** Color used for badges / graph markers. */
export const CLASS_COLOR: Record<MoveClass, string> = {
  brilliant: '#1baaa6',
  great: '#5c8bb0',
  best: '#95bb4a',
  excellent: '#96af8b',
  good: '#96af8b',
  book: '#a88865',
  forced: '#8f8f8f',
  inaccuracy: '#f0c15c',
  mistake: '#e58f2a',
  blunder: '#ca3431',
  miss: '#ca3431',
};

/** Classes that count against the player in the summary. */
export const NEGATIVE_CLASSES: MoveClass[] = ['inaccuracy', 'mistake', 'blunder', 'miss'];

/** True if this class represents a good or neutral move. */
export function isGood(cls: MoveClass): boolean {
  return !NEGATIVE_CLASSES.includes(cls);
}
