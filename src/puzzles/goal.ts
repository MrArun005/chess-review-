/**
 * What the solver is asked to do, from the puzzle's lichess tags. The mate
 * count is the line length itself: every mate-tagged puzzle in the pack ends
 * in checkmate, so "Checkmate in N" is exact (checked over the whole pack).
 * The win/save wording follows lichess's own theme definitions:
 *   crushing  — "Spot the opponent blunder to obtain a crushing advantage."
 *   advantage — "Seize your chance to get a decisive advantage."
 *   equality  — "Come back from a losing position, and secure a draw or a balanced position."
 */
import { solverMoves, type LPuzzle } from './line';

export interface Goal {
  /** Short headline, e.g. "Checkmate in 2". */
  title: string;
  /** One sentence telling you what to do. */
  ask: string;
}

const movesText = (n: number) => (n === 1 ? 'one move' : `${n} moves`);

export function goalOf(p: LPuzzle): Goal {
  const t = new Set(p.themes);
  const n = solverMoves(p);
  if (t.has('mate')) {
    return {
      title: `Checkmate in ${n}`,
      ask: n === 1 ? 'Deliver checkmate in one move.' : `Force checkmate in ${n} moves.`,
    };
  }
  if (t.has('equality')) {
    return {
      title: 'Save the game',
      ask: n === 1 ? "You're in trouble. Find the one move that holds." : `You're in trouble. Find the ${n} moves that hold.`,
    };
  }
  if (t.has('crushing')) {
    return { title: 'Win decisively', ask: `Your opponent slipped. Punish it — ${movesText(n)} to find.` };
  }
  if (t.has('advantage')) {
    return { title: 'Gain the advantage', ask: `Seize your chance for a clear advantage — ${movesText(n)} to find.` };
  }
  return { title: 'Find the best move', ask: `Find the strongest line — ${movesText(n)} to find.` };
}
