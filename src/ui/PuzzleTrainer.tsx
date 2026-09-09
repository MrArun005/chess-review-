import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from './Board';
import { Confetti } from './Confetti';
import { sound } from './sound';
import { pieceOn, type Puzzle, type PuzzleTheme } from '../review/puzzles';
import { CLASS_LABEL } from '../review/classify';

interface Props {
  puzzles: Puzzle[];
  onExit: () => void;
  /** Fired once per puzzle when it resolves — correct = solved first try, no hints, no reveal. */
  onResult?: (puzzle: Puzzle, correct: boolean) => void;
  /** Label for the back button (default "Back to review"). */
  backLabel?: string;
}

type Status = 'solving' | 'solved' | 'revealed';

const THEME_HINT: Record<PuzzleTheme, string> = {
  Checkmate: 'There is a forced checkmate here. Hunt the king.',
  Fork: 'Look for a fork — one move that attacks two things at once.',
  Pin: 'Look for a pin — freeze a piece against something more valuable behind it.',
  Skewer: 'Look for a skewer — attack a valuable piece so the one behind it falls.',
  'Win material': 'Something can be taken for free (or for less than it is worth).',
  'Back rank': "The back rank is weak — think about the king's escape squares.",
  Defend: 'Your move here has to deal with a threat. What is under attack?',
  'Best move': 'No fireworks — find the most accurate, purposeful move.',
};

const THEME_WHY: Record<PuzzleTheme, string> = {
  Checkmate: 'It leads to a forced checkmate.',
  Fork: 'It attacks two targets at once — one of them is lost.',
  Pin: 'It pins a piece, so it cannot move without losing something bigger.',
  Skewer: 'It skewers — the piece behind the attacked one falls.',
  'Win material': 'It simply wins material.',
  'Back rank': 'It exploits the weak back rank.',
  Defend: 'It meets the threat instead of ignoring it.',
  'Best move': 'It keeps the advantage where the played move let it slip.',
};

/**
 * Puzzles that teach. Before you solve: what happened in your game, what the
 * mistake cost, and progressive hints (theme → which piece → solution). After:
 * WHY the move works, the engine's continuation you can step through on the
 * board, and why your original move failed. Clean solves build a streak.
 */
export function PuzzleTrainer({ puzzles, onExit, onResult, backLabel = 'Back to review' }: Props) {
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<Status>('solving');
  const [attempts, setAttempts] = useState(0);
  const [wrongSan, setWrongSan] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0); // 0 none · 1 theme · 2 piece
  const [lineStep, setLineStep] = useState(0); // moves of the line applied on the board
  const [streak, setStreak] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [boardWidth, setBoardWidth] = useState(440);
  const boardCol = useRef<HTMLDivElement>(null);
  const reported = useRef<Set<number>>(new Set());
  const solved = useMemo(() => new Set<number>(), []);

  const puzzle = puzzles[idx];

  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const compute = () => {
      const viewH = window.innerHeight - 240;
      setBoardWidth(Math.max(240, Math.min(560, el.clientWidth, viewH)));
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    compute();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  // Reset per-puzzle state whenever the puzzle changes.
  useEffect(() => {
    setStatus('solving');
    setAttempts(0);
    setWrongSan(null);
    setHintLevel(0);
    setLineStep(0);
    setCelebrate(false);
  }, [idx]);

  // The solution + engine line, as SAN, solution first.
  const line = useMemo(() => {
    if (!puzzle) return [] as string[];
    const l = puzzle.line && puzzle.line.length ? puzzle.line : [puzzle.solutionSan];
    return l[0] === puzzle.solutionSan ? l : [puzzle.solutionSan, ...l.slice(1)];
  }, [puzzle]);

  // Board position = puzzle position with the first `lineStep` line moves applied.
  const { shownFen, lastMove } = useMemo(() => {
    if (!puzzle) return { shownFen: '', lastMove: null as { from: string; to: string } | null };
    const c = new Chess(puzzle.fen);
    let last: { from: string; to: string } | null = null;
    for (let i = 0; i < lineStep && i < line.length; i++) {
      try {
        const m =
          i === 0
            ? c.move({ from: puzzle.solutionUci.slice(0, 2), to: puzzle.solutionUci.slice(2, 4), promotion: (puzzle.solutionUci[4] as never) || undefined })
            : c.move(line[i]);
        if (!m) break;
        last = { from: m.from, to: m.to };
      } catch {
        break;
      }
    }
    return { shownFen: c.fen(), lastMove: last };
  }, [puzzle, line, lineStep]);

  if (!puzzle) return null;

  const report = (correct: boolean) => {
    if (reported.current.has(idx)) return;
    reported.current.add(idx);
    onResult?.(puzzle, correct);
  };

  const theme: PuzzleTheme = puzzle.theme ?? 'Best move';
  const fromSq = puzzle.solutionUci.slice(0, 2);
  const pieceName = pieceOn(puzzle.fen, fromSq) ?? 'piece';
  const sideName = puzzle.color === 'w' ? 'White' : 'Black';

  const play = (from: string, to: string, promotion?: string): boolean => {
    if (status !== 'solving') return false;
    const c = new Chess(puzzle.fen);
    let mv;
    try {
      mv = c.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!mv) return false;
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    if (uci === puzzle.solutionUci) {
      sound.forSan(mv.san);
      setLineStep(1);
      setStatus('solved');
      solved.add(idx);
      const clean = attempts === 0 && hintLevel === 0;
      if (clean) {
        setStreak((s) => s + 1);
        setCelebrate(true);
      }
      report(clean);
      return true;
    }
    setWrongSan(mv.san);
    setAttempts((a) => a + 1);
    return false;
  };

  const reveal = () => {
    sound.forSan(puzzle.solutionSan);
    setLineStep(1);
    setStatus('revealed');
    setStreak(0);
    report(false);
  };

  const hint = () => {
    if (hintLevel >= 2) reveal();
    else setHintLevel((h) => h + 1);
  };

  const go = (delta: number) => setIdx((i) => Math.max(0, Math.min(puzzles.length - 1, i + delta)));

  const done = status !== 'solving';
  const clean = status === 'solved' && attempts === 0 && hintLevel === 0;
  const why = puzzle.why ?? THEME_WHY[theme];
  const cost = puzzle.costPct ?? 0;

  return (
    <>
      <div className="puzzle-head">
        <button onClick={onExit}>← {backLabel}</button>
        <div className="puzzle-head-right">
          {streak > 0 && <span className="streak" title="Clean solves in a row">🔥 {streak}</span>}
          <span className="note">Puzzle {idx + 1} / {puzzles.length}</span>
        </div>
      </div>

      <div className="review">
        <div>
          <div className="board-col" ref={boardCol}>
            <div className="board-wrap" style={{ position: 'relative' }}>
              <Board
                fen={shownFen}
                playedFrom={status === 'solving' && hintLevel >= 2 ? fromSq : lastMove?.from}
                playedTo={status === 'solving' ? undefined : lastMove?.to}
                boardWidth={boardWidth}
                boardOrientation={puzzle.color === 'w' ? 'white' : 'black'}
                onPieceDrop={status === 'solving' ? play : undefined}
                userColor={puzzle.color}
              />
              {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
            </div>
          </div>
          <div className="nav">
            <button onClick={() => go(-1)} disabled={idx === 0}>← Prev</button>
            <button onClick={() => go(1)} disabled={idx === puzzles.length - 1}>Next →</button>
          </div>
        </div>

        <div className="side-col">
          {/* ---- before solving: context + hints ---- */}
          {!done && (
            <div className="card">
              <h3>Find the better move</h3>
              <p className="puzzle-context">
                From your game, move {puzzle.moveNumber}. You played <b>{puzzle.playedSan}</b> — a{' '}
                <span className="puzzle-cls">{CLASS_LABEL[puzzle.classification].toLowerCase()}</span>
                {cost > 0 ? ` that cost you ${cost}% win chance.` : '.'}
              </p>
              <p className="puzzle-ask">
                <b>{sideName} to move.</b> Find what you should have played.
              </p>

              {hintLevel >= 1 && (
                <div className="puzzle-hint">
                  <span className="puzzle-theme">{theme}</span>
                  {THEME_HINT[theme]}
                </div>
              )}
              {hintLevel >= 2 && (
                <div className="puzzle-hint">
                  Move the <b>{pieceName}</b> — it is highlighted on the board.
                </div>
              )}
              {wrongSan && (
                <div className="puzzle-feedback wrong">
                  <b>{wrongSan}</b> isn't it. {hintLevel === 0 ? 'Stuck? Take a hint.' : 'Try again.'}
                </div>
              )}

              <div className="puzzle-actions">
                <button onClick={hint}>
                  {hintLevel === 0 ? '💡 Hint' : hintLevel === 1 ? '💡 Another hint' : 'Show solution'}
                </button>
              </div>
            </div>
          )}

          {/* ---- after: why it works + the line + your mistake ---- */}
          {done && (
            <>
              <div className={`card puzzle-why ${status === 'solved' ? 'good' : ''}`}>
                <h3>{status === 'solved' ? (clean ? '✓ Correct — nice!' : '✓ Got it') : 'The answer'}</h3>
                <p className="puzzle-solution">
                  <b>{puzzle.solutionSan}</b> — {why}
                </p>

                {line.length > 1 && (
                  <>
                    <div className="h3" style={{ marginTop: 12 }}>Play the line</div>
                    <div className="puzzle-line">
                      {line.map((san, i) => (
                        <span
                          key={i}
                          className={`san ${i < lineStep ? 'played' : ''} ${i === lineStep - 1 ? 'current' : ''}`}
                        >
                          {san}
                        </span>
                      ))}
                    </div>
                    <div className="puzzle-actions">
                      <button onClick={() => setLineStep(1)} disabled={lineStep <= 1}>⏮</button>
                      <button onClick={() => setLineStep((s) => Math.max(1, s - 1))} disabled={lineStep <= 1}>←</button>
                      <button className="primary" onClick={() => setLineStep((s) => Math.min(line.length, s + 1))} disabled={lineStep >= line.length}>
                        ▶ Next move
                      </button>
                    </div>
                    <p className="note" style={{ marginTop: 6 }}>
                      Step through the engine's line to see how the idea plays out.
                    </p>
                  </>
                )}
              </div>

              {puzzle.explanation && (
                <div className="card">
                  <h3>Why {puzzle.playedSan} failed</h3>
                  <p style={{ margin: 0, fontSize: 14 }}>{puzzle.explanation}</p>
                  {cost > 0 && <p className="note">It cost {cost}% win chance.</p>}
                </div>
              )}

              <div className="puzzle-actions" style={{ marginTop: 2 }}>
                {idx < puzzles.length - 1 ? (
                  <button className="primary" onClick={() => go(1)}>Next puzzle →</button>
                ) : (
                  <button className="primary" onClick={onExit}>Finish</button>
                )}
              </div>
            </>
          )}

          <div className="card">
            <h3>Your mistakes</h3>
            <div className="puzzle-list">
              {puzzles.map((p, i) => (
                <button
                  key={i}
                  className={`puzzle-chip ${i === idx ? 'active' : ''} ${solved.has(i) ? 'done' : ''}`}
                  onClick={() => setIdx(i)}
                  title={`Move ${p.moveNumber}: ${p.playedSan}${p.theme ? ` · ${p.theme}` : ''}`}
                >
                  {p.moveNumber}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
