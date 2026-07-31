/**
 * Cross-game weakness tracker.
 *
 * After each review, the mistakes (inaccuracy/mistake/blunder/miss) are folded
 * into a small localStorage-backed tally: how many, in which phase, and — using
 * the deterministic rule that fired — which *theme* (hung pieces, walked into
 * forks, back-rank, …). Over several games this surfaces the patterns a player
 * repeats, entirely offline and with no server.
 *
 * It is intentionally aggregate-only: no positions or PGNs are stored, just
 * counts.
 */
import type { ReviewResult } from './pipeline';
import type { Phase } from './phase';
import { NEGATIVE_CLASSES } from './classify';

const KEY = 'cr-weakness-v1';

export interface WeaknessData {
  /** Number of games folded in. */
  games: number;
  /** Total graded half-moves seen. */
  moves: number;
  /** Mistakes (inaccuracy/mistake/blunder/miss). */
  mistakes: number;
  /** Blunders only. */
  blunders: number;
  /** Mistake count per game phase. */
  byPhase: Record<Phase, number>;
  /** Mistake count per theme (rule id, or 'other' when no rule fired). */
  byTheme: Record<string, number>;
}

/** Friendly labels for the rule ids used as themes. */
export const THEME_LABEL: Record<string, string> = {
  'misses-mate': 'Missed forced mates',
  'allows-mate': 'Allowed forced mates',
  'hangs-piece': 'Hung pieces',
  'allows-fork': 'Walked into forks',
  'allows-pin': 'Allowed pins',
  'allows-skewer': 'Allowed skewers',
  'allows-backrank': 'Back-rank weaknesses',
  'gets-trapped': 'Trapped your own pieces',
  'drops-material-quiet': 'Quiet material drops',
  'better-was-available': 'Missed stronger moves',
  'positional-fallback': 'Positional slips',
  other: 'Other slips',
};

function empty(): WeaknessData {
  return {
    games: 0,
    moves: 0,
    mistakes: 0,
    blunders: 0,
    byPhase: { opening: 0, middlegame: 0, endgame: 0 },
    byTheme: {},
  };
}

export function loadWeakness(): WeaknessData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<WeaknessData>;
    // Merge onto a fresh shape so a schema bump never crashes the reader.
    const base = empty();
    return {
      games: parsed.games ?? 0,
      moves: parsed.moves ?? 0,
      mistakes: parsed.mistakes ?? 0,
      blunders: parsed.blunders ?? 0,
      byPhase: { ...base.byPhase, ...(parsed.byPhase ?? {}) },
      byTheme: { ...(parsed.byTheme ?? {}) },
    };
  } catch {
    return empty();
  }
}

export function clearWeakness(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Fold a completed review into the running tally and persist it. */
export function recordGame(result: ReviewResult): WeaknessData {
  const data = loadWeakness();
  data.games += 1;
  for (const m of result.moves) {
    data.moves += 1;
    if (!NEGATIVE_CLASSES.includes(m.classification)) continue;
    data.mistakes += 1;
    if (m.classification === 'blunder') data.blunders += 1;
    data.byPhase[m.phase] = (data.byPhase[m.phase] ?? 0) + 1;
    const theme = m.explanations[0]?.ruleId ?? 'other';
    data.byTheme[theme] = (data.byTheme[theme] ?? 0) + 1;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private-mode failures */
  }
  return data;
}

export interface RankedTheme {
  id: string;
  label: string;
  count: number;
}

/** The top mistake themes, most frequent first. */
export function topThemes(data: WeaknessData, limit = 3): RankedTheme[] {
  return Object.entries(data.byTheme)
    .map(([id, count]) => ({ id, label: THEME_LABEL[id] ?? id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** The phase where the most mistakes happen, or null if there are none. */
export function worstPhase(data: WeaknessData): { phase: Phase; count: number } | null {
  const entries = Object.entries(data.byPhase) as [Phase, number][];
  const best = entries.sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return null;
  return { phase: best[0], count: best[1] };
}
