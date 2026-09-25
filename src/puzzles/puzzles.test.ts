import { describe, expect, it } from 'vitest';
import { update, rate, START } from './glicko';
import { decode, judge, solverColor, solverMoves, fenAt, lineSan, type PackRow } from './line';
import { pick, dailyIndex, rushTarget, seeded } from './select';
import { primaryTheme } from './themes';
import { fresh, recordRated, dueRetries, gradeRetry, performance, themeReport } from './profile';

// Real rows from the lichess puzzle database (CC0).
const MATE2: PackRow = ['fZ5yW', '6k1/1p2r3/pK1rp1p1/6P1/PP4R1/6P1/8/R7 w - - 9 40', 'b6a7 b7b5 a7b8 d6d8', 1600, 'discoveredAttack endgame mate mateIn2 rookEndgame short'];
const LONG: PackRow = ['00008', 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24', 'f2g3 e6e7 b2b1 b3c1 b1c1 h6c1', 1797, 'crushing hangingPiece long middlegame'];

describe('glicko-2', () => {
  it("matches Glickman's worked example", () => {
    const r = update({ rating: 1500, rd: 200, vol: 0.06 }, [
      { rating: 1400, rd: 30, score: 1 },
      { rating: 1550, rd: 100, score: 0 },
      { rating: 1700, rd: 300, score: 0 },
    ]);
    expect(r.rating).toBeCloseTo(1464.06, 1);
    expect(r.rd).toBeCloseTo(151.52, 1);
    expect(r.vol).toBeCloseTo(0.05999, 4);
  });

  it('moves up on a win, down on a loss, and floors RD', () => {
    expect(rate(START, 1500, true).rating).toBeGreaterThan(1500);
    expect(rate(START, 1500, false).rating).toBeLessThan(1500);
    let g = START;
    for (let i = 0; i < 300; i++) g = rate(g, 1500, i % 2 === 0);
    expect(g.rd).toBeGreaterThanOrEqual(50);
    expect(Math.abs(g.rating - 1500)).toBeLessThan(60);
  });
});

describe('puzzle line', () => {
  it('solver plays the side that did not make the setup move', () => {
    const p = decode(MATE2);
    expect(solverColor(p)).toBe('b');
    expect(solverMoves(p)).toBe(2);
  });

  it('accepts the line move, rejects others, and finishes on the last move', () => {
    const p = decode(LONG);
    expect(judge(p, 1, 'h6', 'h7').kind).toBe('wrong');
    const first = judge(p, 1, 'e6', 'e7');
    expect(first.kind).toBe('correct');
    expect(first.kind === 'correct' && first.done).toBe(false);
    const last = judge(p, 5, 'h6', 'c1');
    expect(last.kind === 'correct' && last.done).toBe(true);
    expect(judge(p, 1, 'a1', 'a8').kind).toBe('illegal');
  });

  it('accepts any checkmating move', () => {
    // Back rank: after ...f6 both Ra8# (the line) and Rb8# mate.
    const p = decode(['alt', '7k/5ppp/8/8/8/8/5PPP/RR4K1 b - - 0 1', 'f7f6 a1a8', 1000, 'mateIn1']);
    const v = judge(p, 1, 'b1', 'b8');
    expect(v.kind === 'correct' && v.done).toBe(true);
    expect(judge(p, 1, 'g1', 'f1').kind).toBe('wrong');
  });

  it('renders the line as SAN', () => {
    expect(lineSan(decode(MATE2))).toEqual(['Ka7', 'b5+', 'Kb8', 'Rd8#']);
    expect(fenAt(decode(MATE2), 0)).toBe(MATE2[1]);
  });
});

describe('selection', () => {
  const pool = [800, 1000, 1200, 1210, 1500].map((r, i) => decode([`p${i}`, MATE2[1], MATE2[2], r, 'fork']));

  it('prefers the closest unseen puzzle', () => {
    const got = pick(pool, 1205, new Set(), seeded(1));
    expect(['p2', 'p3']).toContain(got?.id);
    expect(pick(pool, 1205, new Set(['p2', 'p3']), seeded(1))?.id).toBe('p1');
  });

  it('falls back to seen puzzles, and respects the filter', () => {
    const all = new Set(pool.map((p) => p.id));
    expect(pick(pool, 1000, all, seeded(2))).not.toBeNull();
    expect(pick(pool, 1000, new Set(), seeded(2), (p) => p.themes.includes('pin'))).toBeNull();
  });

  it('daily index is stable within a UTC day and in range', () => {
    const a = dailyIndex(1762, new Date('2026-09-25T01:00:00Z'));
    const b = dailyIndex(1762, new Date('2026-09-25T23:00:00Z'));
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1762);
    expect(dailyIndex(1762, new Date('2026-09-26T01:00:00Z'))).toBe((a + 1) % 1762);
  });

  it('rush ramps and caps', () => {
    expect(rushTarget(0)).toBe(500);
    expect(rushTarget(10)).toBe(1100);
    expect(rushTarget(1000)).toBe(2800);
  });
});

describe('profile', () => {
  it('records rated attempts, theme stats, and queues misses for retry', () => {
    const p = fresh();
    const win = recordRated(p, decode(MATE2), true);
    expect(win.after).toBeGreaterThan(win.before);
    recordRated(p, decode(LONG), false);
    expect(p.n).toBe(2);
    expect(p.themes.hangingPiece).toEqual({ n: 1, w: 0, opp: 1797 });
    expect(p.retry).toHaveLength(1);
    expect(dueRetries(p, Date.now() + 11 * 60 * 1000)).toHaveLength(1);
    gradeRetry(p, '00008', true);
    expect(p.retry[0].box).toBe(1);
    expect(p.streak.days).toBe(1);
  });

  it('performance and weakness report', () => {
    expect(performance({ n: 4, w: 2, opp: 6000 })).toBe(1500);
    expect(performance({ n: 4, w: 4, opp: 6000 })).toBe(1900);
    const p = fresh();
    p.themes.fork = { n: 5, w: 1, opp: 7500 };
    p.themes.pin = { n: 5, w: 5, opp: 7500 };
    expect(themeReport(p).map((r) => r.theme)).toEqual(['fork', 'pin']);
  });

  it('primary theme picks the most specific idea', () => {
    expect(primaryTheme(['mate', 'mateIn2', 'smotheredMate', 'middlegame'])).toBe('smotheredMate');
    expect(primaryTheme(['fork', 'deflection', 'short'])).toBe('deflection');
    expect(primaryTheme(['short', 'crushing'])).toBeNull();
  });
});
