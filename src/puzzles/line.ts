/**
 * A lichess puzzle is a FEN plus a UCI line. moves[0] is the opponent's move
 * that sets the puzzle up; after it, the solver plays the even-indexed moves
 * that follow (1, 3, 5…) and the opponent's replies (2, 4…) play themselves.
 * Like lichess, any move that delivers checkmate is accepted even if it is not
 * the one in the line.
 */
import { Chess, type Move } from 'chess.js';

export interface LPuzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
}

export type PackRow = [id: string, fen: string, moves: string, rating: number, themes: string];

export function decode(row: PackRow): LPuzzle {
  return { id: row[0], fen: row[1], moves: row[2].split(' '), rating: row[3], themes: row[4] ? row[4].split(' ') : [] };
}

export const uciOf = (m: Pick<Move, 'from' | 'to' | 'promotion'>) => m.from + m.to + (m.promotion ?? '');

/** Play a UCI move on `c`; returns the chess.js move or null if illegal. */
export function playUci(c: Chess, uci: string): Move | null {
  try {
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] as never) || undefined });
  } catch {
    return null;
  }
}

/** Side the solver plays: the side to move AFTER the setup move. */
export function solverColor(p: LPuzzle): 'w' | 'b' {
  return p.fen.split(' ')[1] === 'w' ? 'b' : 'w';
}

/** How many moves the solver has to find. */
export const solverMoves = (p: LPuzzle) => Math.floor(p.moves.length / 2);

/** FEN after the first `ply` moves of the line (0 = the raw puzzle FEN). */
export function fenAt(p: LPuzzle, ply: number): string {
  const c = new Chess(p.fen);
  for (let i = 0; i < ply && i < p.moves.length; i++) playUci(c, p.moves[i]);
  return c.fen();
}

export type Verdict =
  | { kind: 'correct'; move: Move; fen: string; done: boolean }
  | { kind: 'wrong'; move: Move; fen: string }
  | { kind: 'illegal' };

/**
 * Judge the solver's move at line index `ply` (odd). `done` means the puzzle is
 * complete — last move of the line, or a checkmate.
 */
export function judge(p: LPuzzle, ply: number, from: string, to: string, promotion?: string): Verdict {
  const c = new Chess(fenAt(p, ply));
  let mv: Move;
  try {
    mv = c.move({ from, to, promotion: promotion || 'q' });
  } catch {
    return { kind: 'illegal' };
  }
  if (!mv) return { kind: 'illegal' };
  if (c.isCheckmate()) return { kind: 'correct', move: mv, fen: c.fen(), done: true };
  const expected = p.moves[ply];
  if (uciOf(mv) === expected) {
    return { kind: 'correct', move: mv, fen: c.fen(), done: ply + 1 >= p.moves.length };
  }
  return { kind: 'wrong', move: mv, fen: c.fen() };
}

/** The whole line as SAN, setup move first. */
export function lineSan(p: LPuzzle): string[] {
  const c = new Chess(p.fen);
  const out: string[] = [];
  for (const u of p.moves) {
    const m = playUci(c, u);
    if (!m) break;
    out.push(m.san);
  }
  return out;
}
