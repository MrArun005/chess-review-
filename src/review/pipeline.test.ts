/**
 * End-to-end review of fixture games against a scripted engine. These cover
 * the grading paths a player notices within one game: Best vs Excellent, Book
 * hiding a blunder, game-ending plies, and "you allowed mate".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import type { Analysis, PvLine } from '../engine/types';

const { script } = vi.hoisted(() => ({ script: new Map<string, Partial<PvLine>>() }));

vi.mock('../engine/analyzer', () => ({
  getSharedEngine: () => ({
    init: async () => {},
    stop: () => {},
    analyze: async ({ fen, depth }: { fen: string; depth: number }): Promise<Analysis> => {
      const s = script.get(fen) ?? {};
      const line: PvLine = { multipv: 1, depth, cp: s.cp ?? 0, mate: s.mate ?? null, pv: s.pv ?? ['a2a3'] };
      return { fen, depth, lines: [line], best: line };
    },
  }),
}));
vi.mock('../engine/cache', () => ({
  getCached: async () => undefined,
  putCached: async () => {},
}));
vi.mock('./openings', async (orig) => ({
  ...(await orig<typeof import('./openings')>()),
  ensureOpenings: async () => {},
}));

import { reviewGame } from './pipeline';
import { isBookPosition } from './openings';

/** FEN after the first `n` SAN moves of a game. */
function fenAfter(moves: string[], n: number): string {
  const c = new Chess();
  moves.slice(0, n).forEach((m) => c.move(m));
  return c.fen();
}
const pgn = (moves: string[]) => moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ');
const review = (moves: string[]) => reviewGame(pgn(moves), { shallowDepth: 1, deepDepth: 2 });

beforeEach(() => script.clear());

describe('reviewGame grading', () => {
  it("marks a non-losing move Excellent, and only the engine's move Best", async () => {
    const moves = ['e4', 'e5', 'Ke2'];
    // Level before and after 2.Ke2, but the engine wanted 2.Nf3.
    script.set(fenAfter(moves, 2), { cp: 30, pv: ['g1f3'] });
    script.set(fenAfter(moves, 3), { cp: 30, pv: ['b8c6'] });
    const r = await review(moves);
    expect(r.moves[2].classification).toBe('excellent');

    // Same position, engine agrees with the king walk → Best.
    script.set(fenAfter(moves, 2), { cp: 30, pv: ['e1e2'] });
    const r2 = await review(moves);
    expect(r2.moves[2].classification).toBe('best');
  });

  it('never labels a blunder Book, even into a known opening position', async () => {
    const moves = ['e4', 'e5', 'Nf3', 'Nc6'];
    expect(isBookPosition(fenAfter(moves, 3))).toBe(true); // keep the fixture honest
    script.set(fenAfter(moves, 0), { cp: 30, pv: ['e2e4'] });
    script.set(fenAfter(moves, 1), { cp: 30, pv: ['e7e5'] });
    script.set(fenAfter(moves, 2), { cp: 30, pv: ['g1f3'] });
    // Pretend 2.Nf3 hands Black a winning position.
    script.set(fenAfter(moves, 3), { cp: -400, pv: ['b8c6'] });
    script.set(fenAfter(moves, 4), { cp: -400, pv: ['f1c4'] });
    const r = await review(moves);
    expect(r.moves[0].classification).toBe('book');
    expect(r.moves[2].classification).toBe('blunder');
  });

  it('grades and explains a stalemate while winning (game-ending ply)', async () => {
    // Sam Loyd's 10-move stalemate. White is up a heap of material, then 10.Qe6 stalemates.
    const moves = ['e3','a5','Qh5','Ra6','Qxa5','h5','h4','Rah6','Qxc7','f6','Qxd7+','Kf7','Qxb7','Qd3','Qxb8','Qh7','Qxc8','Kg6','Qe6'];
    for (let i = 0; i < moves.length; i++) script.set(fenAfter(moves, i), { cp: 2500, pv: ['c8b7'] });
    const r = await review(moves);
    const last = r.moves[r.moves.length - 1];
    expect(new Chess(last.fenAfter).isStalemate()).toBe(true);
    expect(last.winMoverAfter).toBe(50);
    expect(last.classification).toBe('blunder');
    expect(last.explanations.length).toBeGreaterThan(0);
    expect(last.explanations[0].ruleId).toBe('stalemates');
    expect(r.evalSeries[r.evalSeries.length - 1]).toBe(50);
  });

  it('explains "you allowed mate" and grades the mating move Best', async () => {
    const moves = ['f3', 'e5', 'g4', 'Qh4#'];
    script.set(fenAfter(moves, 2), { cp: 0, pv: ['d2d4'] });
    script.set(fenAfter(moves, 3), { mate: -1, pv: ['d8h4'] }); // Black mates in 1
    const r = await review(moves);
    const g4 = r.moves[2];
    expect(g4.classification).toBe('blunder');
    expect(g4.explanations[0]?.ruleId).toBe('allows-mate');
    expect(g4.explanations[0]?.text).toMatch(/mate in 1/);
    const mate = r.moves[3];
    expect(mate.classification).toBe('best');
    expect(mate.winMoverAfter).toBe(100);
  });
});
