import type { BoardMap, Color } from '../attacks';

export type MotifName =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'backrank'
  | 'trapped'
  | 'hanging'
  | 'mate';

export interface MotifHit {
  motif: MotifName;
  /** Key square (the forking/pinning piece, or the vulnerable piece). */
  square?: string;
  /** Squares of the pieces caught by the motif. */
  targets?: string[];
  /** Material value at stake, in pawns. */
  value?: number;
  /** Short human fragment, e.g. "knight and rook". */
  detail?: string;
}

export interface MotifContext {
  board: BoardMap;
  /** The color creating the threat (the attacker). */
  byColor: Color;
  /** Optional square to focus on (e.g. the piece that just moved). */
  focus?: string;
}
