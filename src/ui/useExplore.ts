import { useCallback, useState } from 'react';
import { Chess } from 'chess.js';
import { winPctWhite } from '../review/winpct';
import { sound } from './sound';
import type { AnalyzeFn } from './useAnalysisEngine';

export interface ExploreState {
  /** Position after the user's explored line. */
  fen: string;
  /** The line the user has played, in SAN. */
  history: string[];
  /** Last move squares for board highlighting. */
  lastMove: { from: string; to: string };
  analysis: {
    bestUci: string | null;
    winWhite: number;
    lineSan: string[];
  } | null;
  loading: boolean;
}

/**
 * "Try your own move" — an on-demand analysis board. Drag a piece from the
 * position on screen and the engine evaluates the resulting position (win% for
 * the eval bar, a best-move arrow, and the best line in SAN). Uses the shared
 * analysis engine passed in.
 */
export function useExplore(analyze: AnalyzeFn, exploreDepth = 16) {
  const [state, setState] = useState<ExploreState | null>(null);

  const run = useCallback(
    async (fen: string) => {
      try {
        const a = await analyze(fen, { depth: exploreDepth, multipv: 1 });
        const bestUci = a.best.pv[0] ?? null;
        setState((s) =>
          s && s.fen === fen
            ? {
                ...s,
                loading: false,
                analysis: {
                  bestUci,
                  winWhite: winPctWhite(a.best),
                  lineSan: pvToSan(fen, a.best.pv),
                },
              }
            : s
        );
      } catch {
        setState((s) => (s && s.fen === fen ? { ...s, loading: false } : s));
      }
    },
    [analyze, exploreDepth]
  );

  /**
   * Attempt a move from `baseFen`. Returns true if legal (so react-chessboard
   * keeps the piece), and kicks off analysis in the background.
   */
  const tryMove = useCallback(
    (baseFen: string, from: string, to: string): boolean => {
      const c = new Chess(baseFen);
      let mv;
      try {
        mv = c.move({ from, to, promotion: 'q' });
      } catch {
        return false;
      }
      if (!mv) return false;

      const fen = c.fen();
      sound.forSan(mv.san);
      setState((s) => ({
        fen,
        history: [...(s?.history ?? []), mv!.san],
        lastMove: { from, to },
        analysis: null,
        loading: true,
      }));
      void run(fen);
      return true;
    },
    [run]
  );

  const reset = useCallback(() => setState(null), []);

  return { explore: state, tryMove, reset };
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
