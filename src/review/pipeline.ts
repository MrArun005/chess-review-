import { Chess } from 'chess.js';
import { Engine } from '../engine/analyzer';
import { getCached, putCached } from '../engine/cache';
import type { Analysis, PvLine } from '../engine/types';
import { winPctWhite, winPctForMover, moveAccuracy } from './winpct';
import { classify, isGood, type MoveClass } from './classify';
import { isBookPosition, lookupOpening, ensureOpenings } from './openings';
import { phaseOf, type Phase } from './phase';
import { extractFacts, materialSwing } from '../brain/facts';
import { explain, type Explanation } from '../brain/engine';
import { explainStrength } from '../brain/positive';
import { loadGame } from './pgn';

export interface ReviewedMove {
  ply: number; // 0-based
  moveNumber: number; // 1-based full move number
  color: 'w' | 'b';
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** White-perspective win% before and after this move. */
  winWhiteBefore: number;
  winWhiteAfter: number;
  /** Mover-perspective win% before and after. */
  winMoverBefore: number;
  winMoverAfter: number;
  drop: number;
  accuracy: number;
  classification: MoveClass;
  phase: Phase;
  bestSan: string | null;
  bestUci: string | null;
  bestLineSan: string[];
  explanations: Explanation[];
}

export interface ReviewResult {
  moves: ReviewedMove[];
  /** White win% at each half-move boundary, length = moves.length + 1. */
  evalSeries: number[];
  openingName: string | null;
  headers: Record<string, string>;
}

export interface ReviewOptions {
  shallowDepth?: number;
  deepDepth?: number;
  /** Called as analysis streams in. */
  onProgress?: (p: ReviewProgress) => void;
  signal?: AbortSignal;
}

export interface ReviewProgress {
  phase: 'scan' | 'deep';
  done: number;
  total: number;
  /** Partial White win% series so the graph can fill live. */
  evalSeries: number[];
}

interface PlyMeta {
  san: string;
  uci: string;
  color: 'w' | 'b';
  moveNumber: number;
  fenBefore: string;
  fenAfter: string;
  legalCount: number;
}

/** Detect a small screen and cap depth so the tab doesn't get killed. */
function defaultDepths(): { shallow: number; deep: number } {
  const small =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(max-width: 640px)')?.matches;
  return small ? { shallow: 10, deep: 14 } : { shallow: 12, deep: 18 };
}

/**
 * Full game review. Two passes:
 *   1. Shallow depth, MultiPV 1 over every position — fills the eval graph fast.
 *   2. Deep depth, MultiPV 2 over inaccuracy-or-worse plies (and their
 *      neighbours, and best-move plies that might be Great/Brilliant).
 * Everything is cached by fen|depth|multipv, so a re-review is near-instant.
 */
export async function reviewGame(
  pgn: string,
  opts: ReviewOptions = {}
): Promise<ReviewResult> {
  const depths = defaultDepths();
  const shallowDepth = opts.shallowDepth ?? depths.shallow;
  const deepDepth = opts.deepDepth ?? depths.deep;

  const { plies, positions, headers } = parseGame(pgn);
  // Load the full opening database (merges into the bundled curated set).
  await ensureOpenings();
  const engine = new Engine();
  await engine.init();

  // Analysis per position index (0..n). Deepened in place across passes.
  const analyses = new Array<Analysis | null>(positions.length).fill(null);
  const evalSeries = new Array<number>(positions.length).fill(50);

  const analyzePos = async (
    index: number,
    depth: number,
    multipv: number
  ): Promise<Analysis> => {
    const fen = positions[index];
    const cached = await getCached(fen, depth, multipv);
    if (cached) {
      analyses[index] = cached;
      return cached;
    }
    const a = await engine.analyze({ fen, depth, multipv });
    analyses[index] = a;
    await putCached(a, multipv);
    return a;
  };

  try {
    // --- Pass 1: shallow scan ---------------------------------------------
    for (let i = 0; i < positions.length; i++) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      // Skip the engine on positions whose move is forced — the eval is
      // inherited from the neighbour so the graph stays continuous.
      const a = await analyzePos(i, shallowDepth, 1);
      evalSeries[i] = winPctWhite(a.best);
      opts.onProgress?.({
        phase: 'scan',
        done: i + 1,
        total: positions.length,
        evalSeries: evalSeries.slice(),
      });
    }

    // Preliminary classification from the shallow pass.
    const prelim = plies.map((_, i) => classifyPly(plies, analyses, i));

    // --- Pass 2: deep on interesting plies --------------------------------
    const deepIndices = new Set<number>();
    plies.forEach((ply, i) => {
      const c = prelim[i].base;
      const bad = c === 'inaccuracy' || c === 'mistake' || c === 'blunder';
      if (bad) {
        // Bad moves need deep MultiPV analysis for accurate grading and
        // explanations; their neighbours give context.
        deepIndices.add(i);
        deepIndices.add(i + 1);
        if (i > 0) deepIndices.add(i - 1);
        return;
      }
      // Best moves only need the deep pass if they could be Brilliant or Great,
      // which requires a tactical move (a capture or a check). Deep-analyzing
      // every quiet best move roughly doubled the second pass for no payoff.
      const tacticalBest = prelim[i].playedBest && /[x+#]/.test(ply.san);
      if (tacticalBest) {
        deepIndices.add(i);
        deepIndices.add(i + 1);
      }
    });

    const deepList = [...deepIndices].filter((i) => i < positions.length).sort((a, b) => a - b);
    let done = 0;
    for (const i of deepList) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const a = await analyzePos(i, deepDepth, 2);
      evalSeries[i] = winPctWhite(a.best);
      done++;
      opts.onProgress?.({
        phase: 'deep',
        done,
        total: deepList.length,
        evalSeries: evalSeries.slice(),
      });
    }

    // --- Build reviewed moves --------------------------------------------
    const moves: ReviewedMove[] = plies.map((_ply, i) =>
      buildReviewedMove(plies, analyses, evalSeries, i)
    );

    const openingName = detectOpening(positions);

    return { moves, evalSeries, openingName, headers };
  } finally {
    engine.dispose();
  }
}

// --- helpers ---------------------------------------------------------------

function parseGame(pgn: string): {
  plies: PlyMeta[];
  positions: string[];
  headers: Record<string, string>;
} {
  const loader = loadGame(pgn);
  const headers = loader.header() as Record<string, string>;
  const verbose = loader.history({ verbose: true });

  const startFen = headers.FEN || undefined;
  const replay = startFen ? new Chess(startFen) : new Chess();

  const plies: PlyMeta[] = [];
  const positions: string[] = [replay.fen()];

  for (const m of verbose) {
    const fenBefore = replay.fen();
    const legalCount = replay.moves().length;
    replay.move(m.san);
    const fenAfter = replay.fen();
    plies.push({
      san: m.san,
      uci: m.from + m.to + (m.promotion ?? ''),
      color: m.color as 'w' | 'b',
      moveNumber: Number(fenBefore.split(/\s+/)[5]) || 1,
      fenBefore,
      fenAfter,
      legalCount,
    });
    positions.push(fenAfter);
  }

  return { plies, positions, headers };
}

interface PrelimClass {
  base: MoveClass;
  playedBest: boolean;
}

/** Preliminary classification from whatever analysis depth we currently have. */
function classifyPly(
  plies: PlyMeta[],
  analyses: (Analysis | null)[],
  i: number
): PrelimClass {
  const ply = plies[i];
  const before = analyses[i]?.best;
  const after = analyses[i + 1]?.best;
  if (!before || !after) return { base: 'good', playedBest: false };

  const winBefore = winPctForMover(before, ply.color);
  const winAfter = 100 - winPctForMover(after, ply.color === 'w' ? 'b' : 'w');
  const drop = winBefore - winAfter;
  const bestUci = before.pv[0] ?? null;
  return { base: classify(drop), playedBest: bestUci === ply.uci };
}

function buildReviewedMove(
  plies: PlyMeta[],
  analyses: (Analysis | null)[],
  evalSeries: number[],
  i: number
): ReviewedMove {
  const ply = plies[i];
  const beforeAnalysis = analyses[i];
  const afterAnalysis = analyses[i + 1];
  const before = beforeAnalysis?.best;
  const after = afterAnalysis?.best;

  const winWhiteBefore = evalSeries[i];
  const winWhiteAfter = evalSeries[i + 1];
  const winMoverBefore = ply.color === 'w' ? winWhiteBefore : 100 - winWhiteBefore;
  const winMoverAfter = ply.color === 'w' ? winWhiteAfter : 100 - winWhiteAfter;
  const drop = winMoverBefore - winMoverAfter;
  const accuracy = moveAccuracy(winMoverBefore, winMoverAfter);

  const bestUci = before?.pv[0] ?? null;
  const bestSan = bestUci ? uciToSan(ply.fenBefore, bestUci) : null;
  const bestLineSan = before ? pvToSan(ply.fenBefore, before.pv) : [];

  const base = classify(drop);
  const classification = finalClass({
    base,
    ply,
    before,
    after,
    beforeAnalysis,
    afterAnalysis,
    winMoverBefore,
    winMoverAfter,
  });

  // Bad moves get a critique; good moves get praise explaining why they work.
  let explanations: Explanation[] = [];
  if ((base === 'inaccuracy' || base === 'mistake' || base === 'blunder') && before && after) {
    const facts = extractFacts({
      fenBefore: ply.fenBefore,
      playedUci: ply.uci,
      fenAfter: ply.fenAfter,
      bestLine: before,
      afterLine: after,
      winBefore: winMoverBefore,
      winAfter: winMoverAfter,
    });
    explanations = explain(facts, ply.fenBefore);
  } else if (isGood(classification)) {
    explanations = explainStrength(ply.fenBefore, ply.uci, ply.fenAfter, classification);
  }

  return {
    ply: i,
    moveNumber: ply.moveNumber,
    color: ply.color,
    san: ply.san,
    uci: ply.uci,
    fenBefore: ply.fenBefore,
    fenAfter: ply.fenAfter,
    winWhiteBefore,
    winWhiteAfter,
    winMoverBefore,
    winMoverAfter,
    drop,
    accuracy,
    classification,
    phase: phaseOf(ply.fenBefore),
    bestSan,
    bestUci,
    bestLineSan,
    explanations,
  };
}

interface FinalClassInput {
  base: MoveClass;
  ply: PlyMeta;
  before?: PvLine;
  after?: PvLine;
  beforeAnalysis: Analysis | null;
  afterAnalysis: Analysis | null;
  winMoverBefore: number;
  winMoverAfter: number;
}

/** Layer the special badges on top of the base classification. */
function finalClass(x: FinalClassInput): MoveClass {
  const { base, ply, before, after, beforeAnalysis } = x;

  // Forced: only one legal move. Checked from the position, no engine needed.
  if (ply.legalCount === 1) return 'forced';

  // Book: the resulting position is still a known opening position.
  if (isBookPosition(ply.fenAfter)) return 'book';

  const playedBest = (before?.pv[0] ?? null) === ply.uci;
  const moverSign = ply.color === 'w' ? 1 : -1;

  // Miss: a mate (or huge swing) was available and not taken. Stacks on bad moves.
  const bestIsMate = before?.mate != null && before.mate * moverSign > 0;
  const playedIsMate = after?.mate != null && after.mate * moverSign > 0;
  if ((base === 'mistake' || base === 'blunder') && bestIsMate && !playedIsMate) {
    return 'miss';
  }

  // Brilliant: a sound sacrifice. Mover gives up >=2 material in the best line,
  // the move is still best-or-near, wasn't already winning, and isn't losing after.
  if ((base === 'best' || base === 'excellent') && before && after) {
    const swing = materialSwing(ply.fenAfter, after.pv, ply.color);
    const sacrifice = swing <= -2;
    if (
      sacrifice &&
      x.winMoverBefore < 90 &&
      x.winMoverAfter > 45
    ) {
      return 'brilliant';
    }
  }

  // Great: the played move is the only good move — PV2 is >=10 win% worse.
  if (base === 'best' && playedBest && beforeAnalysis && beforeAnalysis.lines.length >= 2) {
    const w1 = winPctForMover(beforeAnalysis.lines[0], ply.color);
    const w2 = winPctForMover(beforeAnalysis.lines[1], ply.color);
    if (w1 - w2 >= 10) return 'great';
  }

  return base;
}

function detectOpening(positions: string[]): string | null {
  let name: string | null = null;
  for (const fen of positions) {
    const o = lookupOpening(fen);
    if (o) name = o.name;
    else if (name) break; // left book — keep the deepest name seen
  }
  return name;
}

function uciToSan(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    const m = c.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] as never,
    });
    return m ? m.san : null;
  } catch {
    return null;
  }
}

function pvToSan(fen: string, pv: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, 8)) {
    try {
      const m = c.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] as never,
      });
      if (!m) break;
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}
