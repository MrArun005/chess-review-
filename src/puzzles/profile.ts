/**
 * Your puzzle profile: rating, history, per-theme performance, streaks, the
 * spaced-repetition queue of missed puzzles and the Woodpecker set. Stored in
 * localStorage on this device — no account, no server.
 */
import { rate, START, type Glicko } from './glicko';
import type { LPuzzle, PackRow } from './line';
import { dayKey } from './select';
import { MOTIF_THEMES } from './themes';

export interface ThemeStat {
  /** Attempts, wins, and the sum of the puzzle ratings faced. */
  n: number;
  w: number;
  opp: number;
}

export interface RetryCard {
  row: PackRow;
  box: number;
  due: number;
}

export interface WoodCycle {
  started: number;
  finished: number | null;
  correct: number;
  /** Solving time only (sums per-puzzle time; breaks between puzzles don't count). */
  ms: number;
  done: number;
}

export interface WoodSet {
  created: number;
  rows: PackRow[];
  cycles: WoodCycle[];
}

export type RushKind = '3' | '5' | 'survival';

export interface Today {
  date: string;
  rated: number;
  wins: number;
  themed: number;
  rush: number;
  retry: number;
}

export interface Profile {
  v: 1;
  g: Glicko;
  peak: number;
  n: number;
  wins: number;
  /** [timestamp, rating] after each rated puzzle; capped. */
  history: [number, number][];
  themes: Record<string, ThemeStat>;
  seen: string[];
  rush: Record<RushKind, number>;
  streak: { last: string; days: number; best: number };
  daily: Record<string, boolean>;
  retry: RetryCard[];
  wood: WoodSet | null;
  today: Today;
  /** Offset added to your rating when choosing puzzles. */
  difficulty: number;
  /** Show the theme before solving (easier) or only after (like a real game). */
  showTheme: boolean;
}

const KEY = 'cr-puzzles-v1';
const DAY = 86400000;
/** Leitner intervals for missed puzzles: 10 min, 1, 3, 7, 16, 35 days. */
const INTERVALS = [10 * 60 * 1000, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];

const blankToday = (): Today => ({ date: dayKey(), rated: 0, wins: 0, themed: 0, rush: 0, retry: 0 });

export function fresh(): Profile {
  return {
    v: 1,
    g: { ...START },
    peak: START.rating,
    n: 0,
    wins: 0,
    history: [],
    themes: {},
    seen: [],
    rush: { '3': 0, '5': 0, survival: 0 },
    streak: { last: '', days: 0, best: 0 },
    daily: {},
    retry: [],
    wood: null,
    today: blankToday(),
    difficulty: 0,
    showTheme: false,
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = { ...fresh(), ...(JSON.parse(raw) as Partial<Profile>) } as Profile;
      if (p.today.date !== dayKey()) p.today = blankToday();
      return p;
    }
  } catch {
    /* unavailable or corrupt — start fresh */
  }
  return fresh();
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota / private mode — keep going in memory */
  }
}

export const toRow = (p: LPuzzle): PackRow => [p.id, p.fen, p.moves.join(' '), p.rating, p.themes.join(' ')];

/** Count today toward the daily streak. */
function touchStreak(p: Profile) {
  const today = dayKey();
  if (p.streak.last === today) return;
  const yesterday = dayKey(new Date(Date.now() - DAY));
  p.streak.days = p.streak.last === yesterday ? p.streak.days + 1 : 1;
  p.streak.best = Math.max(p.streak.best, p.streak.days);
  p.streak.last = today;
}

function markSeen(p: Profile, id: string) {
  p.seen.push(id);
  if (p.seen.length > 6000) p.seen.splice(0, p.seen.length - 6000);
}

/** Queue a missed puzzle for spaced repetition (or reset it if already queued). */
export function queueRetry(p: Profile, puzzle: LPuzzle) {
  const existing = p.retry.find((c) => c.row[0] === puzzle.id);
  if (existing) {
    existing.box = 0;
    existing.due = Date.now() + INTERVALS[0];
  } else {
    p.retry.push({ row: toRow(puzzle), box: 0, due: Date.now() + INTERVALS[0] });
    if (p.retry.length > 400) p.retry.splice(0, p.retry.length - 400);
  }
}

export interface RatedOutcome {
  before: number;
  after: number;
}

/**
 * Record a rated attempt: Glicko update, theme stats, history, streak, and a
 * missed puzzle joins the retry queue. Mutates and returns `p`.
 */
export function recordRated(p: Profile, puzzle: LPuzzle, win: boolean, themed = false): RatedOutcome {
  const before = p.g.rating;
  p.g = rate(p.g, puzzle.rating, win);
  p.peak = Math.max(p.peak, p.g.rating);
  p.n++;
  if (win) p.wins++;
  p.history.push([Date.now(), Math.round(p.g.rating)]);
  if (p.history.length > 2000) p.history.splice(0, p.history.length - 2000);
  for (const t of puzzle.themes) {
    const s = (p.themes[t] ??= { n: 0, w: 0, opp: 0 });
    s.n++;
    if (win) s.w++;
    s.opp += puzzle.rating;
  }
  markSeen(p, puzzle.id);
  if (!win) queueRetry(p, puzzle);
  if (p.today.date !== dayKey()) p.today = blankToday();
  p.today.rated++;
  if (win) p.today.wins++;
  if (themed) p.today.themed++;
  touchStreak(p);
  return { before, after: p.g.rating };
}

/** An unrated attempt (rush, woodpecker, retry): only streak + seen + today. */
export function recordUnrated(p: Profile, puzzle: LPuzzle, win: boolean, queueIfMissed = true) {
  markSeen(p, puzzle.id);
  if (!win && queueIfMissed) queueRetry(p, puzzle);
  if (p.today.date !== dayKey()) p.today = blankToday();
  touchStreak(p);
}

export function dueRetries(p: Profile, now = Date.now()): RetryCard[] {
  return p.retry.filter((c) => c.due <= now).sort((a, b) => a.due - b.due);
}

/** Grade a retry card: right moves it up a box, wrong resets it. Mastered cards leave the queue. */
export function gradeRetry(p: Profile, id: string, win: boolean) {
  const i = p.retry.findIndex((c) => c.row[0] === id);
  if (i < 0) return;
  const c = p.retry[i];
  if (win && c.box >= INTERVALS.length - 1) {
    p.retry.splice(i, 1);
    return;
  }
  c.box = win ? c.box + 1 : 0;
  c.due = Date.now() + INTERVALS[c.box];
  p.today.retry++;
}

/** Performance rating over a theme's attempts (linear approximation). */
export function performance(s: ThemeStat): number {
  const avg = s.opp / s.n;
  return Math.round(avg + (400 * (2 * s.w - s.n)) / s.n);
}

export interface ThemeReport {
  theme: string;
  n: number;
  pct: number;
  perf: number;
  /** Performance minus your rating: negative = weakness. */
  gap: number;
}

/** Motif themes with enough attempts to judge, weakest first. */
export function themeReport(p: Profile, minN = 4): ThemeReport[] {
  const out: ThemeReport[] = [];
  for (const t of MOTIF_THEMES) {
    const s = p.themes[t];
    if (!s || s.n < minN) continue;
    const perf = performance(s);
    out.push({ theme: t, n: s.n, pct: Math.round((100 * s.w) / s.n), perf, gap: perf - Math.round(p.g.rating) });
  }
  return out.sort((a, b) => a.gap - b.gap);
}
