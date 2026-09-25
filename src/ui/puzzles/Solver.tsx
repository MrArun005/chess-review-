import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Board } from '../Board';
import { Confetti } from '../Confetti';
import { sound } from '../sound';
import { CLASS_COLOR } from '../../review/classify';
import { fenAt, judge, lineSan, solverColor, solverMoves, type LPuzzle } from '../../puzzles/line';
import { THEMES, primaryTheme, themeName } from '../../puzzles/themes';
import { pieceOn } from '../../review/puzzles';

export interface SolverProps {
  puzzle: LPuzzle;
  /** Fired exactly once per puzzle: true on a clean solve, false at the first miss / hint / reveal. */
  onResult: (win: boolean, ms: number) => void;
  /** Called by the Next button (or automatically in `rush`). */
  onNext?: () => void;
  /** Rush: fast animations, a wrong move ends the puzzle, auto-advance, no hints. */
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

const squaresOf = (uci: string | undefined) => (uci ? { from: uci.slice(0, 2), to: uci.slice(2, 4) } : null);

/**
 * Solve one lichess-style puzzle: the opponent's setup move animates, then you
 * find each move while the replies play themselves. A wrong try is shown on
 * the board with a red arrow and snaps back; the first miss fails the puzzle
 * for rating purposes but you can keep going to find the answer.
 */
export function Solver({
  puzzle,
  onResult,
  onNext,
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
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  const [hint, setHint] = useState(0);
  const [view, setView] = useState<number | null>(null);
  const [altMate, setAltMate] = useState<{ fen: string; from: string; to: string } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [boardWidth, setBoardWidth] = useState(480);
  const boardCol = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  const started = useRef(0);
  const timers = useRef<number[]>([]);

  const color = solverColor(puzzle);
  const total = solverMoves(puzzle);
  const san = useMemo(() => lineSan(puzzle), [puzzle]);
  const primary = primaryTheme(puzzle.themes);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const compute = () => setBoardWidth(Math.max(240, Math.min(760, el.clientWidth, window.innerHeight - 190)));
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    compute();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  // New puzzle: reset, then animate the opponent's setup move.
  useEffect(() => {
    setPly(0);
    setPhase('setup');
    setFailed(false);
    setWrong(null);
    setLastWrong(null);
    setHint(0);
    setView(null);
    setAltMate(null);
    setCelebrate(false);
    setElapsed(0);
    reported.current = false;
    later(() => {
      sound.forSan(san[0] ?? '');
      setPly(1);
      setPhase('solving');
      started.current = performance.now();
    }, rush ? 250 : 650);
    const list = timers.current;
    return () => {
      list.forEach(clearTimeout);
      list.length = 0;
    };
  }, [puzzle, rush, later, san]);

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
      setLastWrong(null);
      if (v.done) {
        if (v.move.from + v.move.to + (v.move.promotion ?? '') !== puzzle.moves[ply]) {
          setAltMate({ fen: v.fen, from: v.move.from, to: v.move.to });
        }
        setPly(puzzle.moves.length);
        if (!failed) {
          report(true);
          if (!rush) setCelebrate(true);
        }
        finish(!failed);
      } else {
        setPly(ply + 1);
        setPhase('reply');
        later(() => {
          sound.forSan(san[ply + 1] ?? '');
          setPly(ply + 2);
          setPhase('solving');
        }, rush ? 200 : 380);
      }
      return true;
    }
    // Wrong.
    setFailed(true);
    report(false);
    setLastWrong(v.move.san);
    setWrong({ from: v.move.from, to: v.move.to, fen: v.fen, san: v.move.san });
    if (rush) finish(false);
    else later(() => setWrong(null), 1100);
    return true;
  };

  const useHint = () => {
    setFailed(true);
    report(false);
    setHint((h) => Math.min(2, h + 1));
  };

  const reveal = () => {
    setFailed(true);
    report(false);
    setWrong(null);
    const from = ply;
    setPly(puzzle.moves.length);
    finish(false);
    // Play the rest of the line out.
    setView(from);
    for (let i = from + 1; i <= puzzle.moves.length; i++) {
      later(() => {
        sound.forSan(san[i - 1] ?? '');
        setView(i);
      }, (i - from) * 650);
    }
  };

  const done = phase === 'done';
  const shownPly = done && view !== null ? view : ply;
  const board = wrong
    ? { fen: wrong.fen, last: { from: wrong.from, to: wrong.to } }
    : done && altMate && view === null
      ? { fen: altMate.fen, last: { from: altMate.from, to: altMate.to } }
      : { fen: fenAt(puzzle, shownPly), last: squaresOf(puzzle.moves[shownPly - 1]) };

  const step = useCallback(
    (d: number) => setView((v) => Math.max(0, Math.min(puzzle.moves.length, (v ?? puzzle.moves.length) + d))),
    [puzzle]
  );

  // Keyboard: ←/→ step through the solution, Enter / N for the next puzzle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (done && e.key === 'ArrowLeft') step(-1);
      else if (done && e.key === 'ArrowRight') step(1);
      else if (done && !rush && (e.key === 'Enter' || e.key.toLowerCase() === 'n')) onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, rush, step, onNext]);

  const found = Math.min(total, Math.floor(ply / 2));
  const hintSq = hint >= 2 && phase === 'solving' ? puzzle.moves[ply]?.slice(0, 2) : undefined;
  const themeVisible = (showTheme || hint >= 1 || done) && primary;
  const secs = Math.floor(elapsed / 1000);
  const win = done && !failed;

  return (
    <>
      <div className="puzzle-head">
        <button onClick={onExit}>← {exitLabel}</button>
        <div className="puzzle-head-right">{head}</div>
      </div>
      <div className="review pz-solve">
        <div className="board-col" ref={boardCol}>
          <div className="board-wrap" style={{ position: 'relative' }}>
            <Board
              fen={board.fen}
              playedFrom={hintSq ?? board.last?.from}
              playedTo={hintSq ? undefined : board.last?.to}
              playedClass={wrong ? 'blunder' : undefined}
              arrows={wrong ? [[wrong.from, wrong.to, CLASS_COLOR.blunder]] : undefined}
              badge={wrong ? { square: wrong.to, cls: 'blunder' } : done && win && board.last ? { square: board.last.to, cls: 'best' } : null}
              boardWidth={boardWidth}
              boardOrientation={color === 'w' ? 'white' : 'black'}
              onPieceDrop={phase === 'solving' && !wrong ? drop : undefined}
              userColor={color}
            />
            {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
          </div>
        </div>

        <aside className="side-col">
          {aside}
          <div className={`card pz-card ${done ? (win ? 'win' : 'loss') : ''}`}>
            {!done ? (
              <>
                <div className="pz-turn">
                  <span className={`pz-dot ${color}`} />
                  <b>{color === 'w' ? 'White' : 'Black'} to move</b>
                  <span className="pz-clock" aria-label="Time">{secs}s</span>
                </div>
                <p className="pz-ask">
                  {phase === 'setup' ? 'Watch the last move…' : failed ? 'Keep going — find the move.' : 'Find the best move.'}
                </p>
                <div className="pz-progress" aria-label={`${found} of ${total} moves found`}>
                  {Array.from({ length: total }, (_, i) => (
                    <i key={i} className={i < found ? 'on' : ''} />
                  ))}
                  <span className="note">{total === 1 ? '1 move' : `${total} moves`}</span>
                </div>
                {themeVisible && (
                  <div className="puzzle-hint">
                    <span className="puzzle-theme">{themeName(primary)}</span>
                    {THEMES[primary]?.lesson}
                  </div>
                )}
                {hint >= 2 && hintSq && (
                  <div className="puzzle-hint">Move the <b>{pieceOn(board.fen, hintSq) ?? 'piece'}</b> on {hintSq}.</div>
                )}
                {lastWrong && (
                  <div className="puzzle-feedback wrong">
                    <b>✗ {lastWrong}</b> isn't it.{failed && !rush ? ' Try again.' : ''}
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
                <h3 className="pz-verdict">{win ? `✓ Solved in ${secs}s` : failed && lastWrong ? '✗ Missed' : 'Solution'}</h3>
                <div className="pz-meta">
                  <span className="pz-rating">Puzzle {puzzle.rating}</span>
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
                    <div className="puzzle-line">
                      {san.map((s, i) => (
                        <button
                          key={i}
                          className={`san ${i % 2 ? 'mine' : ''} ${i < shownPly ? 'played' : ''} ${i === shownPly - 1 ? 'current' : ''}`}
                          onClick={() => setView(i + 1)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="puzzle-actions">
                      <button onClick={() => setView(0)} title="Start">⏮</button>
                      <button onClick={() => step(-1)} title="Back (←)">←</button>
                      <button onClick={() => step(1)} title="Forward (→)">→</button>
                      {onNext && <button className="primary pz-next" onClick={onNext}>Next puzzle ⏎</button>}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
