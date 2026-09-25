import { useEffect, useState } from 'react';
import './puzzles.css';
import { useProfile } from './useProfile';
import { DailySession, RatedSession, RetrySession, RushSession, WoodSession, utcDay, type Flavor } from './Sessions';
import { Board } from '../Board';
import { PuzzleTrainer } from '../PuzzleTrainer';
import { loadDaily } from '../../puzzles/pack';
import { fenAt, solverColor, type LPuzzle } from '../../puzzles/line';
import { dailyIndex } from '../../puzzles/select';
import { dueRetries, performance, themeReport, type Profile } from '../../puzzles/profile';
import { GROUPS, THEMES } from '../../puzzles/themes';
import { deckStats, dueCards, grade, type DeckCard } from '../../review/deck';

type View =
  | { k: 'hub' }
  | { k: 'rated'; flavor: Flavor; theme?: string }
  | { k: 'daily' }
  | { k: 'rush' }
  | { k: 'wood' }
  | { k: 'retry' }
  | { k: 'games'; cards: DeckCard[] };

/** Tactical-strength tiers for the progress ladder. Puzzle rating, not a FIDE rating. */
const TIERS: [number, string][] = [
  [1000, 'Beginner'],
  [1300, 'Club player'],
  [1600, 'Strong club'],
  [1900, 'Expert'],
  [2200, 'Master'],
  [2500, 'Grandmaster'],
  [2800, 'Super-GM'],
];

/** Daily targets. */
const PLAN = { rated: 20, themed: 10, rush: 1 };

export function PuzzlesMode() {
  const { profile, mutate } = useProfile();
  const [view, setView] = useState<View>({ k: 'hub' });
  const hub = () => setView({ k: 'hub' });
  const common = { profile, mutate, onExit: hub };

  // Scroll to the top when switching views.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  switch (view.k) {
    case 'rated':
      return <RatedSession key={`${view.flavor}-${view.theme ?? ''}`} {...common} flavor={view.flavor} theme={view.theme} />;
    case 'daily':
      return <DailySession {...common} />;
    case 'rush':
      return <RushSession {...common} />;
    case 'wood':
      return <WoodSession {...common} />;
    case 'retry':
      return <RetrySession {...common} />;
    case 'games':
      return (
        <PuzzleTrainer
          puzzles={view.cards}
          backLabel="Puzzles"
          onResult={(p, ok) => p.id && grade(p.id, ok)}
          onExit={hub}
        />
      );
    default:
      return <Hub profile={profile} go={setView} />;
  }
}

function Hub({ profile, go }: { profile: Profile; go: (v: View) => void }) {
  const [daily, setDaily] = useState<LPuzzle | null>(null);
  const [packError, setPackError] = useState(false);
  useEffect(() => {
    loadDaily()
      .then((rows) => setDaily(rows[dailyIndex(rows.length)]))
      .catch(() => setPackError(true));
  }, []);

  const rating = Math.round(profile.g.rating);
  const report = themeReport(profile);
  const weak = report.filter((r) => r.gap < 0).slice(0, 4);
  const strong = [...report].reverse().filter((r) => r.gap > 0).slice(0, 3);
  const retryDue = dueRetries(profile).length;
  const deck = deckStats();
  const dailyDone = utcDay() in profile.daily;
  const today = profile.today;
  const next = TIERS.find(([r]) => rating < r) ?? null;
  const current = [...TIERS].reverse().find(([r]) => rating >= r) ?? null;
  const weakest = weak[0]?.theme;
  const winPct = profile.n ? Math.round((100 * profile.wins) / profile.n) : 0;

  const plan = [
    { label: 'Daily puzzle', done: dailyDone ? 1 : 0, of: 1, go: () => go({ k: 'daily' }) },
    { label: 'Rated puzzles', done: today.rated, of: PLAN.rated, go: () => go({ k: 'rated', flavor: 'mix' }) },
    {
      label: weakest ? `Drill: ${THEMES[weakest].name}` : 'Theme drill',
      done: today.themed,
      of: PLAN.themed,
      go: () => go(weakest ? { k: 'rated', flavor: 'theme', theme: weakest } : { k: 'rated', flavor: 'theme', theme: 'fork' }),
    },
    { label: 'Puzzle Rush run', done: today.rush, of: PLAN.rush, go: () => go({ k: 'rush' }) },
    ...(retryDue > 0 ? [{ label: `Missed puzzles due`, done: 0, of: retryDue, go: () => go({ k: 'retry' }) }] : []),
  ];

  return (
    <div className="pz-hub">
      {packError && (
        <div className="card error">
          The puzzle pack isn't built yet. Run <code>node scripts/build-puzzles.mjs lichess_db_puzzle.csv.zst</code> — see the README.
        </div>
      )}

      <section className="pz-top">
        <div className="card pz-rating-card">
          <div className="pz-rating-head">
            <div>
              <h3>Puzzle rating</h3>
              <div className="pz-big">{rating}</div>
              <div className="note">
                ±{Math.round(profile.g.rd * 2)} · peak {Math.round(profile.peak)} · {profile.n} solved-or-missed · {winPct}% clean
              </div>
            </div>
            <div className="pz-streak" title="Days in a row with at least one puzzle">
              <b>🔥 {profile.streak.days}</b>
              <span>day streak · best {profile.streak.best}</span>
            </div>
          </div>
          <RatingChart history={profile.history} />
          <div className="pz-ladder" aria-label="Progress ladder">
            {TIERS.map(([r, name]) => (
              <div key={r} className={`pz-rung ${rating >= r ? 'on' : ''} ${next && next[0] === r ? 'next' : ''}`}>
                <b>{r}</b>
                <span>{name}</span>
              </div>
            ))}
          </div>
          <p className="note" style={{ margin: '6px 0 0' }}>
            {next
              ? `${next[0] - rating} points to ${next[1]}${current ? ` · you are at ${current[1]} level` : ''}.`
              : 'Top of the ladder.'}{' '}
            Tiers are for this trainer's puzzle rating, not FIDE titles.
          </p>
        </div>

        <div className="card pz-daily">
          <h3>Daily puzzle</h3>
          {daily ? (
            <button className="pz-daily-board" onClick={() => go({ k: 'daily' })} aria-label="Play the daily puzzle">
              <Board fen={fenAt(daily, 1)} boardWidth={220} boardOrientation={solverColor(daily) === 'w' ? 'white' : 'black'} />
            </button>
          ) : (
            <div className="pz-daily-board placeholder" />
          )}
          <div className="pz-daily-foot">
            <span className="note">
              {dailyDone ? (profile.daily[utcDay()] ? '✓ Solved today' : '✗ Missed today') : daily ? `${solverColor(daily) === 'w' ? 'White' : 'Black'} to move` : ''}
            </span>
            <button className={dailyDone ? '' : 'primary'} onClick={() => go({ k: 'daily' })} disabled={!daily}>
              {dailyDone ? 'Replay' : 'Solve'}
            </button>
          </div>
        </div>

        <div className="card pz-plan">
          <h3>Today's training</h3>
          <ul>
            {plan.map((item) => {
              const pct = Math.min(100, Math.round((100 * item.done) / Math.max(1, item.of)));
              return (
                <li key={item.label}>
                  <button className={`pz-plan-row ${pct >= 100 ? 'done' : ''}`} onClick={item.go}>
                    <span className="pz-plan-label">
                      {pct >= 100 ? '✓ ' : ''}
                      {item.label}
                    </span>
                    <span className="pz-plan-count">
                      {Math.min(item.done, item.of)}/{item.of}
                    </span>
                    <span className="pz-bar">
                      <i style={{ width: `${pct}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="note" style={{ margin: 0 }}>
            A little every day beats one long session a week.
          </p>
        </div>
      </section>

      <section className="pz-modes">
        <ModeCard
          icon="🎯"
          title="Rated training"
          body="Puzzles at your level that adapt after every move. One in four targets a weak theme."
          stat={`${today.rated} today`}
          primary
          onClick={() => go({ k: 'rated', flavor: 'mix' })}
        />
        <ModeCard
          icon="⚡"
          title="Puzzle Rush"
          body="3 or 5 minutes, or survival. Three misses and you're out."
          stat={`Best ${profile.rush['3']} · ${profile.rush['5']} · ${profile.rush.survival}`}
          onClick={() => go({ k: 'rush' })}
        />
        <ModeCard
          icon="🪵"
          title="Woodpecker"
          body="One fixed set, solved again and again, faster each cycle."
          stat={
            profile.wood
              ? `${profile.wood.rows.length} puzzles · ${profile.wood.cycles.filter((c) => c.finished).length} cycles done`
              : 'Build a set'
          }
          onClick={() => go({ k: 'wood' })}
        />
        <ModeCard
          icon="🧠"
          title="Calculation"
          body="Long lines only (3+ moves), no hints, a bit above your rating."
          stat="Deep lines"
          onClick={() => go({ k: 'rated', flavor: 'calc' })}
        />
        <ModeCard
          icon="👑"
          title="Master games"
          body="Positions from games between titled players and super-GMs."
          stat="1,500 positions"
          onClick={() => go({ k: 'rated', flavor: 'master' })}
        />
        <ModeCard
          icon="🔁"
          title="Missed puzzles"
          body="Every miss comes back on a spaced-repetition schedule until it sticks."
          stat={retryDue ? `${retryDue} due now` : `${profile.retry.length} queued`}
          disabled={retryDue === 0}
          onClick={() => go({ k: 'retry' })}
        />
        {deck.total > 0 && (
          <ModeCard
            icon="♟"
            title="From your games"
            body="Your own blunders from reviewed games, as puzzles."
            stat={deck.due ? `${deck.due} due` : 'All caught up'}
            disabled={deck.due === 0}
            onClick={() => go({ k: 'games', cards: dueCards() })}
          />
        )}
      </section>

      <section className="pz-insight">
        <div className="card">
          <h3>Weaknesses</h3>
          {weak.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              {report.length === 0
                ? 'Solve about 40 rated puzzles and your weak themes will show up here.'
                : 'No theme is below your rating. Raise the difficulty.'}
            </p>
          ) : (
            <div className="pz-bars">
              {weak.map((r) => (
                <ThemeBar key={r.theme} r={r} onClick={() => go({ k: 'rated', flavor: 'theme', theme: r.theme })} />
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Strengths</h3>
          {strong.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>Nothing stands out yet.</p>
          ) : (
            <div className="pz-bars">
              {strong.map((r) => (
                <ThemeBar key={r.theme} r={r} onClick={() => go({ k: 'rated', flavor: 'theme', theme: r.theme })} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="pz-library">
        <h2>Themes</h2>
        {GROUPS.filter((g) => g !== 'Phase & length').map((group) => (
          <div key={group} className="pz-group">
            <h3>{group}</h3>
            <div className="pz-themes">
              {Object.entries(THEMES)
                .filter(([, t]) => t.group === group)
                .map(([key, t]) => {
                  const s = profile.themes[key];
                  const perf = s && s.n >= 4 ? performance(s) : null;
                  const cls = perf === null ? '' : perf >= rating + 50 ? 'good' : perf <= rating - 50 ? 'bad' : '';
                  return (
                    <button key={key} className={`pz-theme ${cls}`} onClick={() => go({ k: 'rated', flavor: 'theme', theme: key })}>
                      <b>{t.name}</b>
                      <span className="pz-theme-lesson">{t.lesson}</span>
                      <span className="pz-theme-stat">
                        {s ? `${s.w}/${s.n}${perf !== null ? ` · perf ${perf}` : ''}` : 'New'}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
        <p className="note">
          Puzzles from the <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">lichess puzzle database</a> (CC0).
          Your rating and history stay in this browser.
        </p>
      </section>
    </div>
  );
}

function ModeCard(props: {
  icon: string;
  title: string;
  body: string;
  stat: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className={`card pz-mode ${props.primary ? 'primary-mode' : ''}`} onClick={props.onClick} disabled={props.disabled}>
      <span className="pz-mode-icon" aria-hidden>{props.icon}</span>
      <b>{props.title}</b>
      <span className="pz-mode-body">{props.body}</span>
      <span className="pz-mode-stat">{props.stat}</span>
    </button>
  );
}

function ThemeBar({ r, onClick }: { r: ReturnType<typeof themeReport>[number]; onClick: () => void }) {
  const w = Math.min(100, Math.abs(r.gap) / 4);
  return (
    <button className="pz-tbar" onClick={onClick} title={`${r.n} attempts · ${r.pct}% · performance ${r.perf}`}>
      <span className="pz-tbar-name">{THEMES[r.theme]?.name ?? r.theme}</span>
      <span className="pz-tbar-track">
        <i className={r.gap < 0 ? 'neg' : 'pos'} style={{ width: `${w}%` }} />
      </span>
      <span className={`pz-tbar-gap ${r.gap < 0 ? 'neg' : 'pos'}`}>
        {r.gap > 0 ? '+' : ''}
        {r.gap}
      </span>
    </button>
  );
}

function RatingChart({ history }: { history: [number, number][] }) {
  const pts = history.slice(-300);
  if (pts.length < 2) {
    return <div className="pz-chart empty note">Your rating graph starts after a couple of rated puzzles.</div>;
  }
  const W = 600;
  const H = 120;
  const vals = pts.map((p) => p[1]);
  const lo = Math.floor((Math.min(...vals) - 20) / 50) * 50;
  const hi = Math.ceil((Math.max(...vals) + 20) / 50) * 50;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  return (
    <div className="pz-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Rating history, ${lo} to ${hi}`}>
        <polygon points={`0,${H} ${line} ${W},${H}`} className="area" />
        <polyline points={line} className="line" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="pz-chart-hi">{hi}</span>
      <span className="pz-chart-lo">{lo}</span>
    </div>
  );
}
