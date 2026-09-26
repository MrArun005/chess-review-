import { useCallback, useEffect, useRef, useState } from 'react';
import { Solver } from './Solver';
import type { Mutate } from './useProfile';
import { loadAround, loadDaily, loadMaster } from '../../puzzles/pack';
import { decode, type LPuzzle } from '../../puzzles/line';
import { dailyIndex, pick, rushTarget, type Filter } from '../../puzzles/select';
import {
  dueRetries,
  gradeRetry,
  recordRated,
  recordUnrated,
  themeReport,
  toRow,
  type Profile,
  type RushKind,
  type WoodCycle,
} from '../../puzzles/profile';
import { THEMES, themeName } from '../../puzzles/themes';

interface Common {
  profile: Profile;
  mutate: Mutate;
  onExit: () => void;
}

export type Flavor = 'mix' | 'theme' | 'calc' | 'master';

const PACK_MISSING =
  'The puzzle pack is not built. Run: node scripts/build-puzzles.mjs lichess_db_puzzle.csv.zst (see README).';

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

function Loading({ error, onExit }: { error: string | null; onExit: () => void }) {
  return (
    <div className="intake">
      {error ? <div className="error">{error}</div> : <p>Loading puzzles…</p>}
      <button onClick={onExit}>← Puzzles</button>
    </div>
  );
}

function RatingBox({ profile, delta }: { profile: Profile; delta: number | null }) {
  return (
    <div className="card pz-rating-box">
      <div className="pz-big">
        {Math.round(profile.g.rating)}
        {delta !== null && (
          <span className={`pz-delta ${delta >= 0 ? 'up' : 'down'}`}>
            {delta >= 0 ? '+' : '−'}
            {Math.abs(Math.round(delta))}
          </span>
        )}
      </div>
      <div className="note">Puzzle rating · ±{Math.round(profile.g.rd * 2)} · peak {Math.round(profile.peak)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Rated training: mixed, themed, calculation, master games                 */
/* ------------------------------------------------------------------------ */

const FLAVOR_LABEL: Record<Flavor, string> = {
  mix: 'Rated training',
  theme: 'Theme',
  calc: 'Calculation',
  master: 'Master games',
};

export function RatedSession({ profile, mutate, onExit, flavor, theme }: Common & { flavor: Flavor; theme?: string }) {
  const [pool, setPool] = useState<LPuzzle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<LPuzzle | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [log, setLog] = useState<{ id: string; rating: number; win: boolean }[]>([]);
  const [drill, setDrill] = useState<string | null>(null);
  // Bumped on every pick so the board resets even if the same puzzle comes back.
  const [round, setRound] = useState(0);

  const target = () => profile.g.rating + profile.difficulty + (flavor === 'calc' ? 100 : 0);
  const filter = (drillTheme: string | null): Filter | undefined => {
    if (flavor === 'theme' && theme) return (p) => p.themes.includes(theme);
    if (flavor === 'calc') return (p) => p.themes.includes('long') || p.themes.includes('veryLong');
    if (drillTheme) return (p) => p.themes.includes(drillTheme);
    return undefined;
  };

  // (Re)load the pool around the current target; themed pools reach wider.
  const load = useCallback(async () => {
    const t = profile.g.rating + profile.difficulty + (flavor === 'calc' ? 100 : 0);
    const rows = flavor === 'master' ? await loadMaster() : await loadAround(t, flavor === 'theme' ? 500 : 300);
    return rows;
  }, [flavor, profile]);

  const next = useCallback(
    (rows: LPuzzle[]) => {
      // Mixed training steers one puzzle in four toward your weakest theme.
      let d: string | null = null;
      if (flavor === 'mix' && Math.random() < 0.25) {
        const weak = themeReport(profile).filter((r) => r.gap < -50).slice(0, 3);
        if (weak.length) d = weak[Math.floor(Math.random() * weak.length)].theme;
      }
      const seen = new Set(profile.seen);
      const p = pick(rows, target(), seen, Math.random, filter(d)) ?? pick(rows, target(), seen, Math.random, filter(null));
      setDrill(p && d && p.themes.includes(d) ? d : null);
      setPuzzle(p);
      setRound((r) => r + 1);
      if (!p) setError('No puzzles match here yet.');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flavor, theme, profile]
  );

  useEffect(() => {
    let alive = true;
    load()
      .then((rows) => {
        if (!alive) return;
        setPool(rows);
        next(rows);
      })
      .catch(() => alive && setError(PACK_MISSING));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flavor, theme]);

  const onResult = (win: boolean) => {
    if (!puzzle) return;
    const out = mutate((p) => recordRated(p, puzzle, win, flavor === 'theme'));
    setDelta(out.after - out.before);
    setLog((l) => [...l, { id: puzzle.id, rating: puzzle.rating, win }]);
  };

  const onNext = async () => {
    setDelta(null);
    // The rating may have drifted out of the loaded bands.
    const rows = flavor === 'master' ? pool! : await load();
    setPool(rows);
    next(rows);
  };

  if (!puzzle || !pool) return <Loading error={error} onExit={onExit} />;

  const title = flavor === 'theme' && theme ? themeName(theme) : FLAVOR_LABEL[flavor];
  const wins = log.filter((l) => l.win).length;
  const lesson = flavor === 'theme' && theme ? THEMES[theme]?.lesson : null;

  return (
    <Solver
      key={round}
      puzzle={puzzle}
      onResult={onResult}
      onNext={onNext}
      onExit={onExit}
      showTheme={profile.showTheme || flavor === 'theme'}
      hints={flavor !== 'calc'}
      head={<span className="note">{title}</span>}
      aside={
        <>
          <RatingBox profile={profile} delta={delta} />
          {lesson && (
            <div className="card">
              <h3>{title}</h3>
              <p className="pz-lesson">{lesson}</p>
            </div>
          )}
          {flavor === 'calc' && (
            <div className="card">
              <h3>Calculation</h3>
              <p className="pz-lesson">
                Three moves or more, no hints, a little above your rating. Before you touch a piece, see the whole line — every
                reply, not just the one you hope for.
              </p>
            </div>
          )}
          {drill && (
            <div className="card pz-drill">
              <h3>Weakness drill</h3>
              <p className="pz-lesson">This one targets a theme you miss often.</p>
            </div>
          )}
          <div className="card">
            <h3>
              This session · {wins}/{log.length}
            </h3>
            <div className="pz-log">
              {log.length === 0 && <span className="note">Your results appear here.</span>}
              {log.map((l, i) => (
                <a
                  key={i}
                  className={`pz-chip ${l.win ? 'win' : 'loss'}`}
                  href={`https://lichess.org/training/${l.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`${l.rating} · ${l.win ? 'solved' : 'missed'}`}
                >
                  {l.rating}
                </a>
              ))}
            </div>
            <div className="pz-settings">
              <label>
                Difficulty
                <select
                  value={profile.difficulty}
                  onChange={(e) => mutate((p) => void (p.difficulty = Number(e.target.value)))}
                >
                  <option value={-300}>Easiest (−300)</option>
                  <option value={-150}>Easier (−150)</option>
                  <option value={0}>Normal</option>
                  <option value={150}>Harder (+150)</option>
                  <option value={300}>Hardest (+300)</option>
                </select>
              </label>
              {flavor !== 'theme' && (
                <label className="pz-check">
                  <input
                    type="checkbox"
                    checked={profile.showTheme}
                    onChange={(e) => mutate((p) => void (p.showTheme = e.target.checked))}
                  />
                  Show theme before solving
                </label>
              )}
            </div>
          </div>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Daily puzzle                                                             */
/* ------------------------------------------------------------------------ */

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

export function DailySession({ profile, mutate, onExit, onContinue }: Common & { onContinue: () => void }) {
  const [puzzle, setPuzzle] = useState<LPuzzle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const day = utcDay();
  // Fixed at mount: finishing today's attempt must not relabel it as a replay.
  const [already] = useState(() => day in profile.daily);

  useEffect(() => {
    loadDaily()
      .then((rows) => setPuzzle(rows[dailyIndex(rows.length)]))
      .catch(() => setError(PACK_MISSING));
  }, []);

  if (!puzzle) return <Loading error={error} onExit={onExit} />;

  const onResult = (win: boolean) => {
    if (already) return; // replaying today's puzzle is unrated
    const out = mutate((p) => {
      p.daily[day] = win;
      return p.seen.includes(puzzle.id) ? null : recordRated(p, puzzle, win);
    });
    if (out) setDelta(out.after - out.before);
  };

  return (
    <Solver
      puzzle={puzzle}
      onResult={onResult}
      onNext={onContinue}
      nextLabel="Next: rated puzzles →"
      onExit={onExit}
      showTheme={false}
      head={<span className="note">Daily puzzle · {day}</span>}
      aside={
        <>
          <RatingBox profile={profile} delta={delta} />
          <div className="card">
            <h3>Daily puzzle</h3>
            <p className="pz-lesson">
              One of lichess's hand-picked daily puzzles — the same for everyone today (UTC). {already ? 'You have played it already, so this attempt is unrated.' : 'It counts for your rating.'}
            </p>
            <p className="note">🔥 {profile.streak.days}-day streak · best {profile.streak.best}</p>
          </div>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Retry missed puzzles (spaced repetition)                                 */
/* ------------------------------------------------------------------------ */

export function RetrySession({ profile, mutate, onExit }: Common) {
  const [queue] = useState(() => dueRetries(profile).map((c) => decode(c.row)));
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);

  if (i >= queue.length) {
    const upcoming = profile.retry.map((c) => c.due).sort((a, b) => a - b)[0];
    return (
      <div className="intake">
        <h2 style={{ marginTop: 0 }}>✓ Caught up</h2>
        {queue.length > 0 && <p>You re-solved {score} of {queue.length}. Misses come back in 10 minutes; hits come back later and later until they stick.</p>}
        {upcoming && <p className="note">Next card due {new Date(upcoming).toLocaleString()}.</p>}
        <button className="primary" onClick={onExit}>← Puzzles</button>
      </div>
    );
  }

  const puzzle = queue[i];
  return (
    <Solver
      puzzle={puzzle}
      onResult={(win) => {
        if (win) setScore((s) => s + 1);
        mutate((p) => {
          gradeRetry(p, puzzle.id, win);
          recordUnrated(p, puzzle, win, false);
        });
      }}
      onNext={() => setI((x) => x + 1)}
      onExit={onExit}
      head={<span className="note">Missed puzzles · {i + 1}/{queue.length}</span>}
      aside={
        <div className="card">
          <h3>Spaced repetition</h3>
          <p className="pz-lesson">
            Puzzles you missed, back on a schedule: 10 minutes, then 1, 3, 7, 16 and 35 days. Solve it cleanly and it waits
            longer; miss it again and it starts over. Pattern memory is built by repetition, not by seeing a position once.
          </p>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Puzzle Rush                                                              */
/* ------------------------------------------------------------------------ */

const RUSH_MS: Record<RushKind, number | null> = { '3': 180000, '5': 300000, survival: null };
const RUSH_LABEL: Record<RushKind, string> = { '3': '3 minutes', '5': '5 minutes', survival: 'Survival' };

export function RushSession({ profile, mutate, onExit }: Common) {
  const [kind, setKind] = useState<RushKind | null>(null);
  const [puzzle, setPuzzle] = useState<LPuzzle | null>(null);
  const [results, setResults] = useState<{ p: LPuzzle; win: boolean }[]>([]);
  const [left, setLeft] = useState(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deadline = useRef(0);
  const used = useRef(new Set<string>());
  const count = useRef(0);
  const finished = useRef(false);

  const strikes = results.filter((r) => !r.win).length;
  const score = results.filter((r) => r.win).length;

  const fetchNext = useCallback(async () => {
    const t = rushTarget(count.current);
    const rows = await loadAround(t, 100);
    // Prefetch the next band while this puzzle is being solved.
    void loadAround(rushTarget(count.current + 4), 100).catch(() => {});
    const p = pick(rows, t, used.current, Math.random, (x) => x.moves.length <= 6);
    if (p) used.current.add(p.id);
    setPuzzle(p);
  }, []);

  const end = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setOver(true);
  }, []);

  // Save the run once it ends.
  useEffect(() => {
    if (!over || !kind) return;
    mutate((p) => {
      p.rush[kind] = Math.max(p.rush[kind], score);
      p.today.rush++;
      for (const r of results) recordUnrated(p, r.p, r.win);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  useEffect(() => {
    if (!kind || over) return;
    const ms = RUSH_MS[kind];
    if (ms === null) return;
    const t = window.setInterval(() => {
      const l = deadline.current - performance.now();
      setLeft(Math.max(0, l));
      if (l <= 0) end();
    }, 100);
    return () => clearInterval(t);
  }, [kind, over, end]);

  const start = (k: RushKind) => {
    setKind(k);
    setResults([]);
    setOver(false);
    finished.current = false;
    used.current = new Set(profile.seen.slice(-2000));
    count.current = 0;
    deadline.current = performance.now() + (RUSH_MS[k] ?? 0);
    setLeft(RUSH_MS[k] ?? 0);
    fetchNext().catch(() => setError(PACK_MISSING));
  };

  if (!kind) {
    return (
      <div className="pz-rush-pick">
        <div className="puzzle-head">
          <button onClick={onExit}>← Puzzles</button>
        </div>
        <div className="card pz-hero">
          <h2>Puzzle Rush</h2>
          <p className="pz-lesson">
            Puzzles start easy and climb 60 points each. Three misses and you are out. Speed is pattern recognition — the more
            patterns you own, the less you have to calculate.
          </p>
          <div className="pz-rush-modes">
            {(Object.keys(RUSH_LABEL) as RushKind[]).map((k) => (
              <button key={k} className="pz-rush-mode" onClick={() => start(k)}>
                <b>{RUSH_LABEL[k]}</b>
                <span>Best {profile.rush[k]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (over) {
    const best = profile.rush[kind];
    return (
      <div className="intake pz-rush-over">
        <h2 style={{ marginTop: 0 }}>
          {score} {score === 1 ? 'puzzle' : 'puzzles'}
          {score >= best && score > 0 ? ' · new best!' : ''}
        </h2>
        <p className="note">{RUSH_LABEL[kind]} · best {best} · reached puzzle rating {rushTarget(Math.max(0, results.length - 1))}</p>
        <div className="pz-log">
          {results.map((r, i) => (
            <a key={i} className={`pz-chip ${r.win ? 'win' : 'loss'}`} href={`https://lichess.org/training/${r.p.id}`} target="_blank" rel="noreferrer">
              {r.p.rating}
            </a>
          ))}
        </div>
        {strikes > 0 && <p className="note">Your misses went into the spaced-repetition queue.</p>}
        <div className="puzzle-actions" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={() => start(kind)}>Play again</button>
          <button onClick={() => setKind(null)}>Modes</button>
          <button onClick={onExit}>← Puzzles</button>
        </div>
      </div>
    );
  }

  if (!puzzle) return <Loading error={error} onExit={onExit} />;

  const timed = RUSH_MS[kind] !== null;
  return (
    <Solver
      key={`${count.current}-${puzzle.id}`}
      puzzle={puzzle}
      rush
      hints={false}
      onResult={(win) => {
        const nr = [...results, { p: puzzle, win }];
        setResults(nr);
        if (nr.filter((x) => !x.win).length >= 3) end();
      }}
      onNext={() => {
        if (finished.current) return;
        count.current++;
        fetchNext().catch(() => setError(PACK_MISSING));
      }}
      onExit={end}
      exitLabel="End run"
      head={
        <div className="pz-rush-bar">
          {timed && <span className={`pz-timer ${left < 20000 ? 'low' : ''}`}>{fmtTime(left)}</span>}
          <span className="pz-score">{score}</span>
          <span className="pz-strikes">
            {[0, 1, 2].map((i) => (
              <i key={i} className={i < strikes ? 'x' : ''}>✕</i>
            ))}
          </span>
        </div>
      }
      aside={
        <div className="card">
          <h3>{RUSH_LABEL[kind]}</h3>
          <div className="pz-log">
            {results.map((r, i) => (
              <span key={i} className={`pz-chip ${r.win ? 'win' : 'loss'}`}>{r.p.rating}</span>
            ))}
          </div>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Woodpecker: one fixed set, solved again and again, faster each cycle      */
/* ------------------------------------------------------------------------ */

export function WoodSession({ profile, mutate, onExit }: Common) {
  const [building, setBuilding] = useState(false);
  const [size, setSize] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const wood = profile.wood;

  const build = async () => {
    setBuilding(true);
    try {
      // The method uses puzzles a little below your level: accuracy first, then speed.
      const t = profile.g.rating - 200;
      const rows = await loadAround(t, 200);
      const seen = new Set(profile.seen);
      const chosen: LPuzzle[] = [];
      const taken = new Set<string>();
      while (chosen.length < size) {
        const p = pick(rows, t + (Math.random() - 0.5) * 300, new Set([...seen, ...taken]));
        if (!p || taken.has(p.id)) break;
        taken.add(p.id);
        chosen.push(p);
      }
      mutate((p) => {
        p.wood = { created: Date.now(), rows: chosen.map(toRow), cycles: [] };
      });
    } catch {
      setError(PACK_MISSING);
    } finally {
      setBuilding(false);
    }
  };

  if (!wood) {
    return (
      <div>
        <div className="puzzle-head">
          <button onClick={onExit}>← Puzzles</button>
        </div>
        <div className="card pz-hero">
          <h2>Woodpecker method</h2>
          <p className="pz-lesson">
            From GMs Axel Smith and Hans Tikkanen's <i>The Woodpecker Method</i>: take one fixed set of puzzles, solve it all,
            then solve the same set again — and again — aiming to go faster every cycle. Repetition turns patterns into instinct.
            The set is built slightly below your rating ({Math.round(profile.g.rating - 200)}) so accuracy comes first.
          </p>
          {error && <div className="error">{error}</div>}
          <div className="pz-rush-modes">
            {[50, 100, 200].map((n) => (
              <button key={n} className={`pz-rush-mode ${size === n ? 'active' : ''}`} onClick={() => setSize(n)}>
                <b>{n} puzzles</b>
                <span>{n === 50 ? 'a week' : n === 100 ? 'a fortnight' : 'a month'} per first cycle</span>
              </button>
            ))}
          </div>
          <button className="primary" disabled={building} onClick={build} style={{ marginTop: 12 }}>
            {building ? 'Building…' : `Build my ${size}-puzzle set`}
          </button>
        </div>
      </div>
    );
  }

  const cycles = wood.cycles;
  const active: WoodCycle | undefined = cycles.find((c) => c.finished === null);
  const idx = active?.done ?? 0;
  const puzzle = decode(wood.rows[Math.min(idx, wood.rows.length - 1)]);

  const startCycle = () =>
    mutate((p) => {
      p.wood!.cycles.push({ started: Date.now(), finished: null, correct: 0, ms: 0, done: 0 });
    });

  const table = (
    <div className="card">
      <h3>Cycles</h3>
      {cycles.length === 0 ? (
        <p className="note">No cycles yet.</p>
      ) : (
        <table className="pz-table">
          <thead>
            <tr><th>#</th><th>Accuracy</th><th>Solve time</th><th>Per puzzle</th></tr>
          </thead>
          <tbody>
            {cycles.map((c, i) => (
              <tr key={i} className={c.finished === null ? 'live' : ''}>
                <td>{i + 1}</td>
                <td>{c.done ? Math.round((100 * c.correct) / c.done) : 0}%</td>
                <td>{fmtTime(c.ms)}</td>
                <td>{c.done ? `${(c.ms / c.done / 1000).toFixed(1)}s` : '—'}{c.finished === null ? ` · ${c.done}/${wood.rows.length}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        className="pz-danger"
        onClick={() => {
          if (confirm('Throw away this Woodpecker set and its cycle history?')) mutate((p) => void (p.wood = null));
        }}
      >
        New set
      </button>
    </div>
  );

  if (!active) {
    return (
      <div>
        <div className="puzzle-head">
          <button onClick={onExit}>← Puzzles</button>
        </div>
        <div className="pz-wood-idle">
          <div className="card pz-hero">
            <h2>Woodpecker · {wood.rows.length} puzzles</h2>
            <p className="pz-lesson">
              {cycles.length === 0
                ? 'Your set is ready. Cycle 1 is about accuracy: take your time and get them right.'
                : `Cycle ${cycles.length} done. Start cycle ${cycles.length + 1} — same puzzles, same order. Aim to beat ${fmtTime(cycles[cycles.length - 1].ms)}.`}
            </p>
            <button className="primary" onClick={startCycle}>Start cycle {cycles.length + 1}</button>
          </div>
          {table}
        </div>
      </div>
    );
  }

  return (
    <Solver
      key={`${cycles.length}-${idx}`}
      puzzle={puzzle}
      onResult={(win, ms) =>
        mutate((p) => {
          const c = p.wood!.cycles.find((x) => x.finished === null)!;
          c.ms += ms;
          if (win) c.correct++;
          recordUnrated(p, puzzle, win, false);
        })
      }
      onNext={() =>
        mutate((p) => {
          const c = p.wood!.cycles.find((x) => x.finished === null)!;
          c.done++;
          if (c.done >= p.wood!.rows.length) c.finished = Date.now();
        })
      }
      onExit={onExit}
      head={<span className="note">Woodpecker · cycle {cycles.length} · {idx + 1}/{wood.rows.length}</span>}
      aside={table}
    />
  );
}
