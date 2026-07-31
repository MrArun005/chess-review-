import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordGame, loadWeakness, clearWeakness, topThemes, worstPhase } from './weakness';
import type { ReviewResult, ReviewedMove } from './pipeline';

// The tests run in Node (no DOM); give the module a real in-memory localStorage.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

function mv(partial: Partial<ReviewedMove>): ReviewedMove {
  return {
    ply: 0,
    moveNumber: 1,
    color: 'w',
    san: 'e4',
    uci: 'e2e4',
    fenBefore: '',
    fenAfter: '',
    winWhiteBefore: 50,
    winWhiteAfter: 50,
    winMoverBefore: 50,
    winMoverAfter: 50,
    drop: 0,
    accuracy: 100,
    classification: 'good',
    phase: 'middlegame',
    bestSan: null,
    bestUci: null,
    bestLineSan: [],
    explanations: [],
    ...partial,
  };
}

function result(moves: ReviewedMove[]): ReviewResult {
  return { moves, evalSeries: [], openingName: null, headers: {} };
}

// jsdom provides localStorage in the test environment.
describe('weakness tracker', () => {
  beforeEach(() => clearWeakness());

  it('starts empty', () => {
    const d = loadWeakness();
    expect(d.games).toBe(0);
    expect(d.mistakes).toBe(0);
    expect(topThemes(d)).toEqual([]);
    expect(worstPhase(d)).toBeNull();
  });

  it('counts only negative-class moves as mistakes', () => {
    const d = recordGame(
      result([
        mv({ classification: 'best' }),
        mv({ classification: 'good' }),
        mv({ classification: 'blunder', phase: 'endgame', explanations: [{ ruleId: 'hangs-piece', category: 'tactic', text: '' }] }),
        mv({ classification: 'mistake', phase: 'middlegame', explanations: [{ ruleId: 'hangs-piece', category: 'tactic', text: '' }] }),
        mv({ classification: 'inaccuracy', phase: 'opening', explanations: [] }),
      ])
    );
    expect(d.games).toBe(1);
    expect(d.moves).toBe(5);
    expect(d.mistakes).toBe(3);
    expect(d.blunders).toBe(1);
    expect(d.byTheme['hangs-piece']).toBe(2);
    expect(d.byTheme['other']).toBe(1); // inaccuracy with no explanation
  });

  it('accumulates across games and ranks themes', () => {
    recordGame(result([mv({ classification: 'blunder', explanations: [{ ruleId: 'allows-fork', category: 'tactic', text: '' }] })]));
    const d = recordGame(
      result([
        mv({ classification: 'mistake', explanations: [{ ruleId: 'allows-fork', category: 'tactic', text: '' }] }),
        mv({ classification: 'mistake', explanations: [{ ruleId: 'hangs-piece', category: 'tactic', text: '' }] }),
      ])
    );
    expect(d.games).toBe(2);
    const top = topThemes(d, 2);
    expect(top[0].id).toBe('allows-fork');
    expect(top[0].count).toBe(2);
    expect(top[0].label).toBe('Walked into forks');
  });

  it('reports the worst phase', () => {
    const d = recordGame(
      result([
        mv({ classification: 'blunder', phase: 'endgame' }),
        mv({ classification: 'mistake', phase: 'endgame' }),
        mv({ classification: 'mistake', phase: 'opening' }),
      ])
    );
    const w = worstPhase(d);
    expect(w).not.toBeNull();
    expect(w!.phase).toBe('endgame');
    expect(w!.count).toBe(2);
  });

  it('survives a corrupt stored blob', () => {
    localStorage.setItem('cr-weakness-v1', '{not valid json');
    const d = loadWeakness();
    expect(d.games).toBe(0);
  });
});
