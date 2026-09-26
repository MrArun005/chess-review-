import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Board } from '../Board';
import { Confetti } from '../Confetti';
import { sound } from '../sound';
import { voice } from '../voice';
import { PIECE_SVG } from '../pieceSvgs';
import { wrongReason } from '../PuzzleTrainer';
import { CLASS_COLOR } from '../../review/classify';
import { fenAt, judge, lineSan, solverColor, solverMoves, type LPuzzle } from '../../puzzles/line';
import { goalOf } from '../../puzzles/goal';
import { speakSquares, spokenSan } from '../../puzzles/speech';
import { THEMES, primaryTheme, themeName } from '../../puzzles/themes';
import { pieceOn } from '../../review/puzzles';

export interface SolverProps {
  puzzle: LPuzzle;
  /** Fired exactly once per puzzle: true on a clean solve, false at the first miss / hint / reveal. */
  onResult: (win: boolean, ms: number) => void;
  /** Called by the Next button (or automatically in `rush`). */
  onNext?: () => void;
  /** Label for the Next button. */
  nextLabel?: string;
  /** Rush: fast animations, a wrong move ends the puzzle, auto-advance, no hints, no voice. */
  rush?: boolean;
  /** Offer hints / solution (both count as a miss). */
  hints?: boolean;
  /** Reveal the theme before solving. */
  showTheme?: boolean;
  /** Extra content for the side panel, above the puzzle card. */
  aside?: ReactNode;
  /** Right side of the header bar. */
  head?: ReactNode;
  onExit: () => void;
  exitLabel?: string;
}

type Phase = 'setup' | 'solving' | 'reply' | 'done';

interface Wrong {
  from: string;
  to: string;
  fen: string;
  san: string;
}

interface Coach {
  title: string;
  text: string;
  mood: 'neutral' | 'good' | 'bad' | 'hint';
}

const PRAISE = ['Good move!', 'Correct!', "That's it!", 'Nice!', 'Exactly!'];
const FINAL = ['Excellent — puzzle solved!', 'Well done, solved!', 'Brilliant, you got it!', 'Great job, solved!'];
const INTRO_KEY = 'cr-pz-intro';
const INTRO =
  "Here's how it works: the highlighted squares show your opponent's last move. Find your best reply — drag a piece, or tap it and then tap a square. If there's more to it, I'll play their answers for you.";

const squaresOf = (uci: string | undefined) => (uci ? { from: uci.slice(0, 2), to: uci.slice(2, 4) } : null);
const hashOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function firstTime(): boolean {
  try {
    if (localStorage.getItem(INTRO_KEY)) return false;
    localStorage.setItem(INTRO_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Solve one lichess-style puzzle with a coach beside the board: the opponent's
 * setup move animates, the coach says what just happened and what to aim for
 * (out loud, if the voice is on), and reacts to every move. Replies play
 * themselves. A wrong try shows on the board with a red arrow and snaps back;
 * the first miss fails the puzzle for rating purposes, but you can keep going.
 */
export function Solver({
  puzzle,
  onResult,
  onNext,
  nextLabel = 'Next puzzle →',
  rush = false,
  hints = true,
  showTheme = false,
  aside,
  head,
  onExit,
  exitLabel = 'Puzzles',
}: SolverProps) {
  const [ply, setPly] = useState(0);
  const [phase, setPhase] = useState<Phase>('setup');
  const [failed, setFailed] = useState(false);
  const [wrong, setWrong] = useState<Wrong | null>(null);
  const [goodSq, setGoodSq] = useState<string | null>(null);
  const [hint, setHint] = useState(0);
  const [view, setView] = useState<number | null>(null);
  const [altMate, setAltMate] = useState<{ fen: string; from: string; to: string } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [boardWidth, setBoardWidth] = useState(480);
  const [voiceOn, setVoiceOn] = useState(voice.isOn());
  const [coach, setCoach] = useState<Coach>({ title: '', text: '', mood: 'neutral' });
  /** 0 = the rated attempt; each "Try again" bumps it (practice, never re-reported). */
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const boardCol = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  const started = useRef(0);
  const timers = useRef<number[]>([]);
  const playTimers = useRef<number[]>([]);

  const color = solverColor(puzzle);
  const me = color === 'w' ? 'White' : 'Black';
  const opp = color === 'w' ? 'Black' : 'White';
  const total = solverMoves(puzzle);
  const san = useMemo(() => lineSan(puzzle), [puzzle]);
  const goal = useMemo(() => goalOf(puzzle), [puzzle]);
  const primary = primaryTheme(puzzle.themes);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /** Update the coach bubble and, unless in Rush, say it. */
  const tell = useCallback(
    (c: Coach, spoken?: string) => {
      setCoach(c);
      if (!rush) voice.say(speakSquares(spoken ?? c.text));
    },
    [rush]
  );

  useEffect(
    () => () => {
      voice.stop();
      playTimers.current.forEach(clearTimeout);
    },
    []
  );

  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const compute = () => setBoardWidth(Math.max(240, Math.min(760, el.clientWidth, window.innerHeight - 250)));
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    compute();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  // A new puzzle gets a fresh result; "Try again" (attempt > 0) never reports twice.
  useEffect(() => {
    reported.current = false;
    setAttempt(0);
  }, [puzzle]);

  const stopPlay = useCallback(() => {
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
    setPlaying(false);
  }, []);

  // New puzzle (or a retry): reset, animate the opponent's setup move, then brief the solver.
  useEffect(() => {
    stopPlay();
    setPly(0);
    setPhase('setup');
    setFailed(false);
    setWrong(null);
    setGoodSq(null);
    setHint(0);
    setView(null);
    setAltMate(null);
    setCelebrate(false);
    setElapsed(0);
    setCoach({ title: goal.title, text: `Watch ${opp}'s move…`, mood: 'neutral' });
    later(() => {
      const setup = san[0] ?? '';
      sound.forSan(setup);
      setPly(1);
      setPhase('solving');
      started.current = performance.now();
      const intro = attempt > 0 ? 'Practice run — this try does not change your rating. ' : !rush && firstTime() ? `${INTRO} ` : '';
      tell(
        { title: goal.title, text: `${intro}${opp} just played ${setup}. ${goal.ask}`, mood: 'neutral' },
        `${intro}${opp} played ${spokenSan(setup)}. ${goal.title}. ${goal.ask}`
      );
    }, rush ? 250 : 650);
    const list = timers.current;
    return () => {
      list.forEach(clearTimeout);
      list.length = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, attempt, rush, later, san]);

  // Clock.
  useEffect(() => {
    if (phase === 'setup' || phase === 'done') return;
    const t = window.setInterval(() => setElapsed(performance.now() - started.current), 250);
    return () => clearInterval(t);
  }, [phase]);

  const report = useCallback(
    (win: boolean) => {
      if (reported.current) return;
      reported.current = true;
      onResult(win, Math.round(performance.now() - started.current));
    },
    [onResult]
  );

  const finish = useCallback(
    (win: boolean) => {
      setPhase('done');
      setElapsed(performance.now() - started.current);
      if (rush && onNext) later(onNext, win ? 350 : 900);
    },
    [rush, onNext, later]
  );

  const drop = (from: string, to: string, promotion?: string): boolean => {
    if (phase !== 'solving' || wrong) return false;
    const v = judge(puzzle, ply, from, to, promotion);
    if (v.kind === 'illegal') return false;
    sound.forSan(v.move.san);
    if (v.kind === 'correct') {
      setGoodSq(v.move.to);
      if (v.done) {
        const alt = v.move.from + v.move.to + (v.move.promotion ?? '') !== puzzle.moves[ply];
        if (alt) setAltMate({ fen: v.fen, from: v.move.from, to: v.move.to });
        setPly(puzzle.moves.length);
        const secs = Math.round((performance.now() - started.current) / 1000);
        if (!failed) {
          report(true);
          sound.solved();
          if (!rush) setCelebrate(true);
          const found = total === 1 ? 'the move' : `all ${total} moves`;
          const altNote = alt ? ' A different mate from the main line — that counts too.' : '';
          tell({
            title: '✓ Solved',
            text:
              attempt > 0
                ? `Nice — you solved it this time.${altNote} This was a practice run, so your rating stays the same.`
                : `${FINAL[hashOf(puzzle.id) % FINAL.length]} You found ${found} in ${secs}s.${altNote}`,
            mood: 'good',
          });
        } else {
          sound.correct();
          tell({
            title: 'Solved — after a mistake',
            text: 'You found it, but only after a wrong move, so it counts as a miss. Press ▶ Watch solution to see the whole line, or ↺ Try again to play it cleanly.',
            mood: 'neutral',
          });
        }
        finish(!failed);
      } else {
        sound.correct();
        const praise = PRAISE[(ply >> 1) % PRAISE.length];
        setCoach({ title: goal.title, text: praise, mood: 'good' });
        setPly(ply + 1);
        setPhase('reply');
        later(() => {
          const reply = san[ply + 1] ?? '';
          sound.forSan(reply);
          setPly(ply + 2);
          setPhase('solving');
          setGoodSq(null);
          tell(
            { title: goal.title, text: `${praise} ${opp} answered ${reply}. Keep going — your move.`, mood: 'good' },
            `${praise} ${opp} answered ${spokenSan(reply)}. Your move.`
          );
        }, rush ? 200 : 420);
      }
      return true;
    }
    // Wrong.
    sound.wrong();
    setFailed(true);
    report(false);
    setWrong({ from: v.move.from, to: v.move.to, fen: v.fen, san: v.move.san });
    const reason = wrongReason(v.fen, color, v.move.san, '');
    tell(
      { title: goal.title, text: `${v.move.san} isn't it.${reason ? ` ${reason}` : ''}${rush ? '' : ' Try again.'}`, mood: 'bad' },
      `That's not it.${reason ? ` ${reason}` : ''} Try again.`
    );
    if (rush) finish(false);
    else later(() => setWrong(null), 1100);
    return true;
  };

  const useHint = () => {
    setFailed(true);
    report(false);
    const level = Math.min(2, hint + 1);
    setHint(level);
    if (level === 1) {
      tell({
        title: '💡 Hint',
        text: primary
          ? `This is a ${themeName(primary).toLowerCase()} puzzle. ${THEMES[primary].lesson}`
          : 'Look at forcing moves first: checks, captures and threats.',
        mood: 'hint',
      });
    } else {
      const sq = puzzle.moves[ply]?.slice(0, 2) ?? '';
      const piece = pieceOn(fenAt(puzzle, ply), sq) ?? 'piece';
      tell({ title: '💡 Hint', text: `Your ${piece} on ${sq} is the piece to move.`, mood: 'hint' });
    }
  };

  const len = puzzle.moves.length;

  /** Animate (and say) the line from position `from` to the end. Any manual step stops it. */
  const playLine = (from: number) => {
    stopPlay();
    setPlaying(true);
    setView(from);
    for (let i = from + 1; i <= len; i++) {
      playTimers.current.push(
        window.setTimeout(() => {
          sound.forSan(san[i - 1] ?? '');
          if (!rush) voice.say(spokenSan(san[i - 1] ?? ''));
          setView(i);
          if (i === len) setPlaying(false);
        }, (i - from) * 1000)
      );
    }
    if (from >= len) setPlaying(false);
  };

  const reveal = () => {
    setFailed(true);
    report(false);
    setWrong(null);
    const from = ply;
    setPly(len);
    finish(false);
    setCoach({ title: 'Solution', text: 'Watch the answer play out. Then press ↺ Try again to play it yourself.', mood: 'neutral' });
    playLine(from);
  };

  /** Show the position after `n` moves of the line (1 = the puzzle's starting position). */
  const goTo = (n: number) => {
    stopPlay();
    const at = Math.max(1, Math.min(len, n));
    setView(at);
    if (!rush) voice.say(spokenSan(san[at - 1] ?? ''));
  };

  const retry = () => {
    stopPlay();
    setAttempt((a) => a + 1);
  };

  const toggleVoice = () => {
    const v = !voiceOn;
    voice.setOn(v);
    setVoiceOn(v);
    if (v) voice.say(coach.text);
  };

  const done = phase === 'done';
  const shownPly = done && view !== null ? view : ply;
  const board = wrong
    ? { fen: wrong.fen, last: { from: wrong.from, to: wrong.to } }
    : done && altMate && view === null
      ? { fen: altMate.fen, last: { from: altMate.from, to: altMate.to } }
      : { fen: fenAt(puzzle, shownPly), last: squaresOf(puzzle.moves[shownPly - 1]) };

  /** Position currently shown in the solution viewer (1 … len). */
  const at = Math.max(1, view ?? len);
  const step = (d: number) => goTo(at + d);

  // Keyboard: ←/→ step through the solution, Enter / N for the next puzzle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (!done || rush) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      // A focused button already turns Enter into its own click.
      else if ((e.key === 'Enter' && tag !== 'BUTTON') || e.key.toLowerCase() === 'n') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const found = Math.min(total, Math.floor(ply / 2));
  const hintSq = hint >= 2 && phase === 'solving' ? puzzle.moves[ply]?.slice(0, 2) : undefined;
  const themeVisible = (showTheme || done) && primary;
  const secs = Math.floor(elapsed / 1000);
  const win = done && !failed;
  const badge = wrong
    ? { square: wrong.to, cls: 'blunder' as const }
    : goodSq && (phase === 'reply' || win)
      ? { square: goodSq, cls: 'best' as const }
      : null;

  return (
    <>
      <div className="puzzle-head">
        <button onClick={onExit}>← {exitLabel}</button>
        <div className="puzzle-head-right">{head}</div>
      </div>
      <div className="review pz-solve">
        <div className="board-col" ref={boardCol}>
          <div className="pz-board-stack" style={{ width: boardWidth }}>
            <div className={`pz-banner ${color}`}>
              <span className={`pz-dot ${color}`} />
              <b>{me} to move</b>
              <span className="pz-banner-goal">{goal.title}</span>
            </div>
            <div className="board-wrap" style={{ position: 'relative' }}>
              <Board
                fen={board.fen}
                playedFrom={hintSq ?? board.last?.from}
                playedTo={hintSq ? undefined : board.last?.to}
                playedClass={wrong ? 'blunder' : undefined}
                arrows={wrong ? [[wrong.from, wrong.to, CLASS_COLOR.blunder]] : undefined}
                badge={badge}
                boardWidth={boardWidth}
                boardOrientation={color === 'w' ? 'white' : 'black'}
                onPieceDrop={phase === 'solving' && !wrong ? drop : undefined}
                userColor={color}
              />
              {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
            </div>
          </div>
        </div>

        <aside className="side-col">
          <div className={`card pz-card ${done ? (win ? 'win' : 'loss') : ''}`}>
            <div className="pz-turn">
              <span className="note">{done ? `Puzzle ${puzzle.rating}` : `${total === 1 ? '1 move' : `${total} moves`} to find`}</span>
              <span className="pz-clock" aria-label="Time">{secs}s</span>
              {voice.supported() && !rush && (
                <button
                  className="icon pz-voice"
                  onClick={toggleVoice}
                  aria-pressed={voiceOn}
                  aria-label={voiceOn ? 'Mute the coach voice' : 'Turn the coach voice on'}
                  title={voiceOn ? 'Mute the coach voice' : 'Turn the coach voice on'}
                >
                  {voiceOn ? '🔊' : '🔇'}
                </button>
              )}
            </div>

            <div className={`pz-coach ${coach.mood}`} aria-live="polite">
              <div className="pz-coach-avatar" aria-hidden dangerouslySetInnerHTML={{ __html: PIECE_SVG[color + 'N'] ?? '' }} />
              <div className="pz-coach-bubble">
                {coach.title && <b>{coach.title}</b>}
                <p>{coach.text}</p>
              </div>
            </div>

            {done && onNext && !rush && (
              <button className="primary pz-next-big" onClick={onNext} autoFocus title="Enter">
                {nextLabel}
              </button>
            )}
            {done && !rush && (
              <div className="pz-after">
                <button onClick={playing ? stopPlay : () => playLine(1)}>{playing ? '⏸ Stop' : '▶ Watch solution'}</button>
                <button onClick={retry}>↺ Try again</button>
              </div>
            )}

            {!done ? (
              <>
                <div className="pz-progress" aria-label={`${found} of ${total} moves found`}>
                  {Array.from({ length: total }, (_, i) => (
                    <i key={i} className={i < found ? 'on' : ''} />
                  ))}
                </div>
                {themeVisible && hint === 0 && (
                  <div className="puzzle-hint">
                    <span className="puzzle-theme">{themeName(primary)}</span>
                    {THEMES[primary]?.lesson}
                  </div>
                )}
                {hints && !rush && (
                  <div className="puzzle-actions">
                    <button onClick={useHint} disabled={phase !== 'solving' || hint >= 2} title="Counts as a miss">
                      💡 {hint === 0 ? 'Hint' : 'Show the piece'}
                    </button>
                    <button onClick={reveal} disabled={phase === 'setup'}>Solution</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="pz-meta">
                  <span className="pz-rating">{win ? `✓ ${secs}s` : failed ? '✗ Missed' : ''}</span>
                  <a href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer" className="note">
                    #{puzzle.id} on lichess ↗
                  </a>
                </div>
                <div className="pz-tags">
                  {puzzle.themes.filter((t) => THEMES[t]).map((t) => (
                    <span key={t} className={`pz-tag ${t === primary ? 'main' : ''}`} title={THEMES[t].lesson}>{themeName(t)}</span>
                  ))}
                </div>
                {!rush && (
                  <>
                    <div className="pz-line-head">
                      <b>Solution</b>
                      <span className="note">
                        {at} / {len} · {(at - 1) % 2 === 0 ? opp : me} played {san[at - 1]}
                      </span>
                    </div>
                    <div className="puzzle-line">
                      {san.map((s, i) => (
                        <button
                          key={i}
                          className={`san ${i % 2 ? 'mine' : ''} ${i < at ? 'played' : ''} ${i === at - 1 ? 'current' : ''}`}
                          onClick={() => goTo(i + 1)}
                          title={`${i % 2 ? me : opp}: ${s}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="pz-stepper">
                      <button onClick={() => goTo(1)} disabled={at <= 1}>⏮ Start</button>
                      <button onClick={() => step(-1)} disabled={at <= 1}>◀ Back</button>
                      <button onClick={() => step(1)} disabled={at >= len}>Forward ▶</button>
                      <button onClick={() => goTo(len)} disabled={at >= len}>End ⏭</button>
                    </div>
                    <p className="note pz-keys">Bold moves are yours. Keyboard: ← → step through the solution, Enter goes to the next puzzle.</p>
                  </>
                )}
              </>
            )}
          </div>
          {aside}
        </aside>
      </div>
    </>
  );
}
