import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { getSharedEngine } from '../engine/analyzer';
import type { Analysis } from '../engine/types';
import { winPctWhite, winPctForMover } from '../review/winpct';
import { classify, CLASS_LABEL, CLASS_COLOR, type MoveClass } from '../review/classify';
import { extractFacts } from '../brain/facts';
import { explain } from '../brain/engine';
import { explainStrength } from '../brain/positive';
import { sound } from './sound';
import { CapturedTray, computeCaptured, type CapturedInfo } from './Captured';

/** Depth for the live coach analyses (kept modest so play stays responsive). */
const COACH_DEPTH = 12;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Strength presets. Elo labels are approximate. "Maximum" is unbeatable for humans. */
const LEVELS = [
  { label: 'Beginner (~800)', skill: 0, movetime: 50 },
  { label: 'Easy (~1200)', skill: 3, movetime: 100 },
  { label: 'Intermediate (~1600)', skill: 6, movetime: 200 },
  { label: 'Advanced (~2000)', skill: 11, movetime: 400 },
  { label: 'Expert (~2400)', skill: 16, movetime: 800 },
  { label: 'Maximum (unbeatable)', skill: 20, movetime: 1500 },
];

type Color = 'w' | 'b';
interface Sq {
  from: string;
  to: string;
}

interface Props {
  /** Hand the finished game's PGN to the review flow. */
  onReview: (pgn: string) => void;
}

export function PlayMode({ onReview }: Props) {
  const gameRef = useRef(new Chess());

  // Position history so you can step back through the game.
  const [positions, setPositions] = useState<string[]>([START_FEN]);
  const [moveSquares, setMoveSquares] = useState<Sq[]>([]);
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [viewIdx, setViewIdx] = useState(0); // index into positions

  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [userColor, setUserColor] = useState<Color>('w');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  // Default to Easy (~1200): winnable, and the engine makes mistakes to punish.
  const [levelIdx, setLevelIdx] = useState(1);
  const [colorChoice, setColorChoice] = useState<'w' | 'b' | 'random'>('w');
  const [hintUci, setHintUci] = useState<string | null>(null);
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null);
  const [boardWidth, setBoardWidth] = useState(440);

  // Clock (optional). timeControl is base seconds per side (0 = no clock);
  // increment seconds are added to a player's clock after each of their moves.
  const [timeControl, setTimeControl] = useState(600);
  const [increment, setIncrement] = useState(0);
  const [clock, setClock] = useState<{ w: number; b: number }>({ w: 600000, b: 600000 });
  const incrementRef = useRef(0);
  incrementRef.current = increment;
  const [resultDismissed, setResultDismissed] = useState(false);

  // Live coach.
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [coachMove, setCoachMove] = useState<{ san: string; cls: MoveClass; text: string } | null>(null);
  const [coachSuggest, setCoachSuggest] = useState<{ san: string } | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const lastUserAnalysisRef = useRef<Analysis | null>(null);

  const isLive = viewIdx === positions.length - 1;

  // Refs mirror state the async engine callbacks / event handlers read.
  const levelRef = useRef(levelIdx);
  levelRef.current = levelIdx;
  const userColorRef = useRef(userColor);
  userColorRef.current = userColor;
  const liveRef = useRef(isLive);
  liveRef.current = isLive;
  const resultRef = useRef(result);
  resultRef.current = result;

  // Clock: tick down the side-to-move's time while the live game is running.
  useEffect(() => {
    if (timeControl === 0) return;
    const id = window.setInterval(() => {
      if (resultRef.current || !liveRef.current) return;
      const g = gameRef.current;
      if (g.isGameOver() || g.history().length === 0) return;
      const t = g.turn() === 'w' ? 'w' : 'b';
      setClock((c) => (c[t] <= 0 ? c : { ...c, [t]: Math.max(0, c[t] - 100) }));
    }, 100);
    return () => window.clearInterval(id);
  }, [timeControl]);

  // Flag: whoever runs out of time loses.
  useEffect(() => {
    if (timeControl === 0 || result) return;
    const flagged = clock.w <= 0 ? 'w' : clock.b <= 0 ? 'b' : null;
    if (!flagged) return;
    const winner = flagged === 'w' ? 'Black' : 'White';
    const youLost = flagged === userColorRef.current;
    setResult(`Time — ${winner} wins${youLost ? '.' : '. You win! 🎉'}`);
  }, [clock, result, timeControl]);

  const boardCol = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const compute = () => {
      const viewH = window.innerHeight - 200;
      setBoardWidth(Math.max(240, Math.min(880, el.clientWidth, viewH)));
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

  const getEngine = getSharedEngine;
  // Pre-warm the shared engine as soon as Play opens, so the first move doesn't
  // wait for the worker + neural net to load. Don't dispose it — it's shared.
  useEffect(() => {
    void getSharedEngine()
      .init()
      .catch(() => {});
  }, []);

  /** Rebuild the position history from the live game and jump the view to live. */
  const rebuild = useCallback(() => {
    const g = gameRef.current;
    const verbose = g.history({ verbose: true });
    const replay = new Chess();
    const pos = [replay.fen()];
    const sq: Sq[] = [];
    for (const m of verbose) {
      replay.move(m.san);
      pos.push(replay.fen());
      sq.push({ from: m.from, to: m.to });
    }
    setPositions(pos);
    setMoveSquares(sq);
    setHistorySan(g.history());
    setViewIdx(pos.length - 1);
  }, []);

  const finish = useCallback(() => {
    const g = gameRef.current;
    if (g.isCheckmate()) {
      const winner = g.turn() === 'w' ? 'Black' : 'White';
      const youWon = (g.turn() === 'w' ? 'b' : 'w') === userColorRef.current;
      setResult(`Checkmate — ${winner} wins${youWon ? '. You win! 🎉' : '.'}`);
    } else if (g.isStalemate()) {
      setResult('Stalemate — draw.');
    } else if (g.isInsufficientMaterial()) {
      setResult('Draw — insufficient material.');
    } else if (g.isDraw()) {
      setResult('Draw.');
    }
  }, []);

  const afterMove = useCallback(
    (mv: Move) => {
      sound.forSan(mv.san);
      setHintUci(null);
      // Increment: add time to the clock of whoever just moved.
      if (incrementRef.current > 0) {
        const moved = mv.color === 'w' ? 'w' : 'b';
        setClock((c) => ({ ...c, [moved]: c[moved] + incrementRef.current * 1000 }));
      }
      rebuild();
      if (gameRef.current.isGameOver()) finish();
    },
    [rebuild, finish]
  );

  const engineMove = useCallback(async () => {
    const g = gameRef.current;
    if (g.isGameOver()) return;
    setThinking(true);
    const preset = LEVELS[levelRef.current];
    let uci: string | null = null;
    try {
      uci = await getEngine().play({ fen: g.fen(), skill: preset.skill, movetime: preset.movetime });
    } catch {
      /* engine error */
    }
    setThinking(false);
    if (!uci) return;
    try {
      const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] as 'q') || 'q' });
      if (mv) afterMove(mv);
    } catch {
      /* ignore */
    }
  }, [afterMove]);

  // Coach: recommend the best move for the position it's the user's turn.
  const runSuggestion = useCallback(async () => {
    const g = gameRef.current;
    if (g.isGameOver()) return;
    const fen = g.fen();
    try {
      const a = await getSharedEngine().analyze({ fen, depth: COACH_DEPTH, multipv: 1 });
      lastUserAnalysisRef.current = a;
      const bestUci = a.best.pv[0];
      const bestSan = bestUci ? uciToSan(fen, bestUci) : null;
      if (bestSan && gameRef.current.fen() === fen) setCoachSuggest({ san: bestSan });
    } catch {
      /* ignore */
    }
  }, []);

  // Coach: grade the move the user just played and explain it.
  const gradeUserMove = useCallback(
    async (fenBefore: string, uci: string, san: string, afterFen: string, before: Analysis | null) => {
      setCoachBusy(true);
      try {
        const a = await getSharedEngine().analyze({ fen: afterFen, depth: COACH_DEPTH, multipv: 1 });
        const color = userColorRef.current;
        const winWhiteAfter = winPctWhite(a.best);
        const winMoverAfter = color === 'w' ? winWhiteAfter : 100 - winWhiteAfter;
        let cls: MoveClass = 'good';
        let text = '';
        if (before) {
          const winMoverBefore = winPctForMover(before.best, color);
          cls = classify(winMoverBefore - winMoverAfter);
          if (cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder') {
            const facts = extractFacts({
              fenBefore,
              playedUci: uci,
              fenAfter: afterFen,
              bestLine: before.best,
              afterLine: a.best,
              winBefore: winMoverBefore,
              winAfter: winMoverAfter,
            });
            text = explain(facts, fenBefore)[0]?.text ?? '';
          } else {
            text = explainStrength(fenBefore, uci, afterFen, cls)[0]?.text ?? '';
          }
        }
        setCoachMove({ san, cls, text });
      } catch {
        /* ignore */
      } finally {
        setCoachBusy(false);
      }
    },
    []
  );

  const newGame = useCallback(
    (choice: 'w' | 'b' | 'random') => {
      gameRef.current = new Chess();
      const color: Color = choice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
      gameRef.current.header(
        'White', color === 'w' ? 'You' : 'Engine',
        'Black', color === 'b' ? 'You' : 'Engine',
        'Event', 'Play vs Engine'
      );
      setUserColor(color);
      userColorRef.current = color;
      setOrientation(color === 'w' ? 'white' : 'black');
      setResult(null);
      setResultDismissed(false);
      setHintUci(null);
      setPremove(null);
      setThinking(false);
      setCoachMove(null);
      setCoachSuggest(null);
      setClock({ w: timeControl * 1000, b: timeControl * 1000 });
      lastUserAnalysisRef.current = null;
      setPositions([gameRef.current.fen()]);
      setMoveSquares([]);
      setHistorySan([]);
      setViewIdx(0);
      if (color === 'b') void engineMove(); // engine (White) moves first
    },
    [engineMove, timeControl]
  );

  const onDrop = useCallback(
    (from: string, to: string, promotion = 'q'): boolean => {
      const g = gameRef.current;
      if (thinking || g.isGameOver() || !liveRef.current) return false;
      if (g.turn() !== userColorRef.current) return false;
      const fenBefore = g.fen();
      let mv: Move | null = null;
      try {
        mv = g.move({ from, to, promotion });
      } catch {
        return false;
      }
      if (!mv) return false;
      afterMove(mv);
      if (coachEnabled) {
        setCoachSuggest(null);
        const uci = mv.from + mv.to + (mv.promotion ?? '');
        void gradeUserMove(fenBefore, uci, mv.san, g.fen(), lastUserAnalysisRef.current);
      }
      if (!g.isGameOver()) window.setTimeout(() => void engineMove(), 150);
      return true;
    },
    [thinking, afterMove, engineMove, coachEnabled, gradeUserMove]
  );

  // Coach: when it becomes the user's turn, suggest the best move.
  useEffect(() => {
    if (!coachEnabled) {
      setCoachSuggest(null);
      return;
    }
    const g = gameRef.current;
    if (thinking || result || g.isGameOver()) return;
    if (g.turn() !== userColor) return;
    void runSuggestion();
  }, [coachEnabled, thinking, result, historySan.length, userColor, runSuggestion]);

  const takeback = () => {
    const g = gameRef.current;
    if (g.history().length === 0 || thinking) return;
    g.undo(); // engine's reply
    if (g.turn() !== userColorRef.current && g.history().length > 0) g.undo();
    setResult(null);
    setCoachMove(null);
    setPremove(null);
    rebuild();
  };

  // Execute a queued premove as soon as it becomes the user's turn.
  useEffect(() => {
    if (!premove || thinking || result || !isLive) return;
    if (gameRef.current.turn() !== userColorRef.current) return;
    const { from, to } = premove;
    setPremove(null);
    onDrop(from, to); // discarded automatically if it's no longer legal
  }, [premove, thinking, result, isLive, onDrop]);

  const hint = async () => {
    if (thinking || gameRef.current.isGameOver()) return;
    const uci = await getEngine().play({ fen: gameRef.current.fen(), skill: 20, movetime: 700 });
    setHintUci(uci);
  };

  const resign = () => {
    if (gameRef.current.isGameOver() || historySan.length === 0) return;
    setResult(`You resigned — ${userColor === 'w' ? 'Black' : 'White'} (Engine) wins.`);
  };

  // Browse history with the arrow keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setViewIdx((v) => Math.max(0, v - 1));
      else if (e.key === 'ArrowRight') setViewIdx((v) => Math.min(positions.length - 1, v + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [positions.length]);

  const started = historySan.length > 0 || result !== null;
  const yourTurn =
    !result && !thinking && gameRef.current.turn() === userColor && !gameRef.current.isGameOver();

  // Checkmate marker for the position on screen (matches the review board).
  let mateSquare: string | null = null;
  try {
    const c = new Chess(positions[viewIdx]);
    if (c.isCheckmate()) {
      const loser = c.turn();
      for (const row of c.board()) {
        for (const cell of row) {
          if (cell?.type === 'k' && cell.color === loser) mateSquare = cell.square;
        }
      }
    }
  } catch {
    /* not terminal */
  }

  const rows: { num: number; w?: { san: string; idx: number }; b?: { san: string; idx: number } }[] = [];
  for (let i = 0; i < historySan.length; i += 2) {
    rows.push({
      num: i / 2 + 1,
      w: { san: historySan[i], idx: i + 1 },
      b: historySan[i + 1] ? { san: historySan[i + 1], idx: i + 2 } : undefined,
    });
  }

  const captured = computeCaptured(positions[viewIdx]);
  const bottomSide: 'w' | 'b' = orientation === 'white' ? 'w' : 'b';
  const topSide: 'w' | 'b' = bottomSide === 'w' ? 'b' : 'w';
  // Whose clock is running right now (null when paused / game over / browsing).
  const liveTurn: 'w' | 'b' | null =
    !result && isLive && started ? (gameRef.current.turn() === 'w' ? 'w' : 'b') : null;

  // Single status/hint line shown at the top of the board. It has a fixed slot
  // (see .coach-top) so appearing/disappearing text can never shove the board.
  const hintLine = result
    ? result
    : !isLive
      ? 'Viewing an earlier move — press ⏭ to return to the game.'
      : thinking
        ? 'Engine is thinking…'
        : coachEnabled && coachBusy && !coachMove
          ? 'Reviewing your move…'
          : yourTurn
            ? coachEnabled && coachSuggest
              ? `Hint: play ${coachSuggest.san}`
              : 'Your move.'
            : started
              ? 'Waiting…'
              : 'Pick a strength and colour, then press New game.';

  return (
    <div className="review">
      <div>
        {/* Coach + hint panel above the board. Fixed height → the board never
            jumps as the move grade / hint text appears and disappears. */}
        <div className="coach-top">
          {coachEnabled && coachMove && (
            <div className="coach-line">
              <span className="coach-badge" style={{ background: CLASS_COLOR[coachMove.cls] }}>
                {CLASS_LABEL[coachMove.cls]}
              </span>
              <span className="coach-text">
                <b>{coachMove.san}</b>
                {coachMove.text ? ` — ${coachMove.text}` : ''}
              </span>
            </div>
          )}
          <div className="coach-hint">{hintLine}</div>
        </div>
        <div className="board-col" ref={boardCol}>
          <div className="board-stack">
            <PlayerBar
              name={topSide === userColor ? 'You' : 'Engine'}
              side={topSide}
              captured={captured}
              ms={clock[topSide]}
              active={liveTurn === topSide}
              showClock={timeControl > 0}
              width={boardWidth}
            />
            <div className="board-wrap">
              <Board
                fen={positions[viewIdx]}
                bestUci={isLive ? hintUci : null}
                playedFrom={viewIdx > 0 ? moveSquares[viewIdx - 1]?.from : undefined}
                playedTo={viewIdx > 0 ? moveSquares[viewIdx - 1]?.to : undefined}
                mateSquare={mateSquare}
                boardWidth={boardWidth}
                boardOrientation={orientation}
                onPieceDrop={onDrop}
                userColor={userColor}
                premove={premove}
                onPremove={
                  isLive && !result ? (from, to) => setPremove({ from, to }) : undefined
                }
                onCancelPremove={() => setPremove(null)}
              />
            </div>
            <PlayerBar
              name={bottomSide === userColor ? 'You' : 'Engine'}
              side={bottomSide}
              captured={captured}
              ms={clock[bottomSide]}
              active={liveTurn === bottomSide}
              showClock={timeControl > 0}
              width={boardWidth}
            />
          </div>
        </div>
        <div className="nav">
          <button onClick={() => setViewIdx(0)} disabled={viewIdx === 0}>⏮</button>
          <button onClick={() => setViewIdx((v) => Math.max(0, v - 1))} disabled={viewIdx === 0}>←</button>
          <button
            onClick={() => setViewIdx((v) => Math.min(positions.length - 1, v + 1))}
            disabled={isLive}
          >→</button>
          <button onClick={() => setViewIdx(positions.length - 1)} disabled={isLive}>⏭</button>
        </div>
      </div>

      <div className="side-col">
        <div className="card">
          <h3>Status</h3>
          {result ? (
            <p style={{ margin: 0, fontWeight: 600 }}>{result}</p>
          ) : thinking ? (
            <p className="note" style={{ margin: 0 }}>Engine is thinking…</p>
          ) : started ? (
            <p className="note" style={{ margin: 0 }}>{yourTurn ? 'Your move.' : 'Waiting…'}</p>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              Pick a strength and colour, then hit New game. Drag a piece to move.
            </p>
          )}
          <div className="play-buttons">
            <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
              ⇅ Flip
            </button>
            <button onClick={takeback} disabled={!started || thinking}>↶ Takeback</button>
            <button onClick={hint} disabled={!yourTurn}>💡 Hint</button>
            <button onClick={resign} disabled={!started || result !== null}>🏳 Resign</button>
            <button
              onClick={() => setCoachEnabled((v) => !v)}
              className={coachEnabled ? 'coach-on' : ''}
              style={{ gridColumn: '1 / -1' }}
            >
              🧠 Coach: {coachEnabled ? 'On' : 'Off'}
            </button>
          </div>
          {result && (
            <button style={{ marginTop: 10, width: '100%' }} onClick={() => onReview(gameRef.current.pgn())}>
              🔍 Review this game
            </button>
          )}
        </div>

        <div className="card">
          <h3>Play the engine</h3>
          <div className="play-controls">
            <label>
              Strength
              <select value={levelIdx} onChange={(e) => setLevelIdx(Number(e.target.value))}>
                {LEVELS.map((l, i) => (
                  <option key={i} value={i}>{l.label}</option>
                ))}
              </select>
            </label>
            <label>
              You play
              <select
                value={colorChoice}
                onChange={(e) => setColorChoice(e.target.value as 'w' | 'b' | 'random')}
              >
                <option value="w">White</option>
                <option value="b">Black</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label>
              Clock
              <select
                value={`${timeControl}:${increment}`}
                onChange={(e) => {
                  const [base, inc] = e.target.value.split(':').map(Number);
                  setTimeControl(base);
                  setIncrement(inc);
                }}
              >
                <option value="0:0">No clock</option>
                <option value="180:0">3 min</option>
                <option value="180:2">3 | 2</option>
                <option value="300:0">5 min</option>
                <option value="300:3">5 | 3</option>
                <option value="600:0">10 min</option>
                <option value="600:5">10 | 5</option>
              </select>
            </label>
          </div>
          <button className="primary" style={{ marginTop: 10 }} onClick={() => newGame(colorChoice)}>
            New game
          </button>
        </div>

        {rows.length > 0 && (
          <div className="card">
            <h3>Moves</h3>
            <div className="movelist">
              {rows.map((r, i) => (
                <div style={{ display: 'contents' }} key={i}>
                  <div className="num">{r.num}.</div>
                  <MoveCell m={r.w} viewIdx={viewIdx} onSelect={setViewIdx} />
                  <MoveCell m={r.b} viewIdx={viewIdx} onSelect={setViewIdx} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {result && !resultDismissed && (
        <div className="modal-overlay" onClick={() => setResultDismissed(true)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {/\bwin\b/i.test(result) && result.includes('🎉') ? '🎉 You win!' : 'Game over'}
            </div>
            <p className="modal-result">{result}</p>
            <div className="modal-actions">
              <button className="primary" onClick={() => newGame(colorChoice)}>
                ↻ Rematch
              </button>
              <button onClick={() => onReview(gameRef.current.pgn())}>🔍 Review game</button>
              <button onClick={() => setResultDismissed(true)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A player row above/below the board: name, the pieces they've captured, clock. */
function PlayerBar({
  name,
  side,
  captured,
  ms,
  active,
  showClock,
  width,
}: {
  name: string;
  side: 'w' | 'b';
  captured: CapturedInfo;
  ms: number;
  active: boolean;
  showClock: boolean;
  width: number;
}) {
  return (
    <div className="player-bar" style={{ width }}>
      <span className="player-name">{name}</span>
      <div className="player-captured">
        <CapturedTray info={captured} side={side} />
      </div>
      {showClock && <span className={`player-clock ${active ? 'run' : ''}`}>{fmtClock(ms)}</span>}
    </div>
  );
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function MoveCell({
  m,
  viewIdx,
  onSelect,
}: {
  m?: { san: string; idx: number };
  viewIdx: number;
  onSelect: (i: number) => void;
}) {
  if (!m) return <span className="cell" />;
  return (
    <span
      className={`cell ${viewIdx === m.idx ? 'active' : ''}`}
      onClick={() => onSelect(m.idx)}
    >
      {m.san}
    </span>
  );
}

function uciToSan(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never });
    return m ? m.san : null;
  } catch {
    return null;
  }
}
