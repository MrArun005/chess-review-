/**
 * Turn a reviewed game's mistakes into replayable tactics puzzles: each
 * blunder / mistake / miss becomes "here's the position — find the move you
 * should have played". Fully deterministic — the solution is the engine's best
 * move that the review already computed, so training needs no extra analysis.
 */
import type { ReviewResult } from './pipeline';
import type { MoveClass } from './classify';

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
}

const TRAINABLE: MoveClass[] = ['blunder', 'mistake', 'miss'];

export function buildPuzzles(result: ReviewResult): Puzzle[] {
  const out: Puzzle[] = [];
  for (const m of result.moves) {
    if (!TRAINABLE.includes(m.classification)) continue;
    // Need a concrete, different best move to ask for.
    if (!m.bestUci || !m.bestSan || m.bestUci === m.uci) continue;
    out.push({
      fen: m.fenBefore,
      color: m.color,
      solutionUci: m.bestUci,
      solutionSan: m.bestSan,
      playedSan: m.san,
      classification: m.classification,
      moveNumber: m.moveNumber,
      explanation: m.explanations[0]?.text ?? null,
    });
  }
  return out;
}
