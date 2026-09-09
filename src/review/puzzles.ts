/**
 * Turn a reviewed game's mistakes into puzzles that actually TEACH: each
 * blunder / mistake / miss becomes "find the better move", carrying real
 * context — what kind of idea to look for (theme), why the solution works, the
 * engine's continuation to play through, and what the mistake cost. All of it
 * is derived deterministically from the review; no engine or LLM at puzzle time.
 */
import { Chess } from 'chess.js';
import type { ReviewResult } from './pipeline';
import type { MoveClass } from './classify';
import { explainStrength } from '../brain/positive';
import { boardMap } from '../brain/attacks';
import { detectAll } from '../brain/motifs';

export type PuzzleTheme =
  | 'Checkmate'
  | 'Fork'
  | 'Pin'
  | 'Skewer'
  | 'Win material'
  | 'Back rank'
  | 'Defend'
  | 'Best move';

export interface Puzzle {
  /** Position before the mistake — the puzzle to solve. */
  fen: string;
  /** Side to move. */
  color: 'w' | 'b';
  /** The engine's best move (the solution), as UCI and SAN. */
  solutionUci: string;
  solutionSan: string;
  /** What was actually played (the mistake). */
  playedSan: string;
  classification: MoveClass;
  moveNumber: number;
  /** Plain-English reason the played move was bad, if the review produced one. */
  explanation: string | null;
  /** Stable id (set by the spaced-repetition deck). */
  id?: string;
  /** Teaching context (optional so older stored cards still load). */
  theme?: PuzzleTheme;
  /** Why the solution works, e.g. "Nxe5 forks e7 and d3." */
  why?: string | null;
  /** The engine's continuation after the solution, in SAN (solution first). */
  line?: string[];
  /** Win-chance the mistake cost the mover, in percentage points. */
  costPct?: number;
}

const TRAINABLE: MoveClass[] = ['blunder', 'mistake', 'miss'];

/** Piece name for the solution's mover, for hints ("move the knight"). */
export function pieceOn(fen: string, square: string): string | null {
  try {
    const p = new Chess(fen).get(square as never);
    if (!p) return null;
    return { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[p.type] ?? null;
  } catch {
    return null;
  }
}

function afterMove(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never });
    return m ? c.fen() : null;
  } catch {
    return null;
  }
}

/** What kind of idea the solution is — the hint we give before revealing it. */
function themeFor(fen: string, bestUci: string, line: string[], playedExplanation: string | null): PuzzleTheme {
  if (line.some((s) => s.endsWith('#'))) return 'Checkmate';
  const after = afterMove(fen, bestUci);
  const mover: 'w' | 'b' = fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
  if (after) {
    try {
      const before = new Set(detectAll(boardMap(new Chess(fen)), mover).map((h) => `${h.motif}|${h.square ?? ''}`));
      const created = detectAll(boardMap(new Chess(after)), mover, bestUci.slice(2, 4)).filter(
        (h) => !before.has(`${h.motif}|${h.square ?? ''}`)
      );
      if (created.some((h) => h.motif === 'fork')) return 'Fork';
      if (created.some((h) => h.motif === 'pin')) return 'Pin';
      if (created.some((h) => h.motif === 'skewer')) return 'Skewer';
      if (created.some((h) => h.motif === 'backrank')) return 'Back rank';
      if (created.some((h) => h.motif === 'hanging' && (h.value ?? 0) >= 1)) return 'Win material';
    } catch {
      /* fall through */
    }
    // A capture that the engine prefers is usually about material.
    try {
      const m = new Chess(fen).move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] as never });
      if (m && (m.flags.includes('c') || m.flags.includes('e'))) return 'Win material';
    } catch {
      /* ignore */
    }
  }
  // If the played move hung something / walked into a tactic, the fix is defensive.
  if (playedExplanation && /undefended|hanging|takes it|forks|pins|skewers|trapped|back rank/i.test(playedExplanation)) {
    return 'Defend';
  }
  return 'Best move';
}

export function buildPuzzles(result: ReviewResult): Puzzle[] {
  const out: Puzzle[] = [];
  for (const m of result.moves) {
    if (!TRAINABLE.includes(m.classification)) continue;
    // Need a concrete, different best move to ask for.
    if (!m.bestUci || !m.bestSan || m.bestUci === m.uci) continue;

    const explanation = m.explanations[0]?.text ?? null;
    const line = m.bestLineSan.slice(0, 8);
    const afterBest = afterMove(m.fenBefore, m.bestUci);
    let why: string | null = null;
    if (afterBest) {
      try {
        why = explainStrength(m.fenBefore, m.bestUci, afterBest, 'best')[0]?.text ?? null;
      } catch {
        why = null;
      }
    }
    out.push({
      fen: m.fenBefore,
      color: m.color,
      solutionUci: m.bestUci,
      solutionSan: m.bestSan,
      playedSan: m.san,
      classification: m.classification,
      moveNumber: m.moveNumber,
      explanation,
      theme: themeFor(m.fenBefore, m.bestUci, line, explanation),
      why,
      line,
      costPct: Math.max(0, Math.round(m.winMoverBefore - m.winMoverAfter)),
    });
  }
  return out;
}
