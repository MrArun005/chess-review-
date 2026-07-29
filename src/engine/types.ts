// Shared types for the engine <-> app boundary.

/** A single principal variation returned by the engine for one position. */
export interface PvLine {
  /** MultiPV rank, 1 = best. */
  multipv: number;
  /** Search depth this line was reported at. */
  depth: number;
  /**
   * Centipawn score, ALWAYS normalized to White's perspective
   * (positive = good for White). `null` when the score is a mate.
   */
  cp: number | null;
  /**
   * Mate distance, normalized to White's perspective
   * (positive = White mates in N, negative = Black mates in N). `null` if none.
   */
  mate: number | null;
  /** Principal variation as UCI moves, e.g. ["e2e4", "e7e5"]. */
  pv: string[];
}

/** Full analysis of one position. */
export interface Analysis {
  fen: string;
  depth: number;
  /** PV lines sorted by multipv rank ascending (best first). */
  lines: PvLine[];
  /** Convenience: lines[0], the best line. */
  best: PvLine;
}

/** Request/response messages across the worker boundary. */
export type EngineRequest =
  | { type: 'init' }
  | {
      type: 'analyze';
      id: number;
      fen: string;
      depth: number;
      multipv: number;
    };

export type EngineResponse =
  | { type: 'ready' }
  | { type: 'progress'; id: number; line: PvLine; sideToMove: 'w' | 'b' }
  | { type: 'done'; id: number; analysis: Analysis }
  | { type: 'error'; id: number | null; message: string };
