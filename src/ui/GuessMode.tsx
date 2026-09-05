import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from './Board';
import { CapturedTray, computeCaptured } from './Captured';
import { sound } from './sound';
import type { ReviewResult } from '../review/pipeline';

/**
 * "Guess the Move" — play through a reviewed game trying to find each of your
 * side's moves. The opponent's real moves play automatically; on your turn you
 * guess, and it's scored against what was actually played (or the engine's best,
 * which counts too). All from the review data — no engine needed.
 */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface Props {
  result: ReviewResult;
  onExit: () => void;
}

type Phase = 'choose' | 'playing' | 'done';
type Feedback = { kind: 'correct' | 'better' | 'wrong'; text: string } | null;

export function GuessMode({ result, onExit }: Props) {
  const moves = result.moves;
  const [phase, setPhase] = useState<Phase>('choose');
  const [side, setSide] = useState<'w' | 'b'>('w');
  const [ply, setPly] = useState(0);
  const [fen, setFen] = useState(START_FEN);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [score, setScore] = useState(0);
  const [asked, setAsked] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [boardWidth, setBoardWidth] = useState(440);

  const gameRef = useRef(new Chess());
  const plyRef = useRef(0);
  plyRef.current = ply;
  const boardCol = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const compute = () => {
      const viewH = window.innerHeight - 220;
      setBoardWidth(Math.max(240, Math.min(640, el.clientWidth, viewH)));
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    compute();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [phase]);

  const applyActual = useCallback(() => {
    const p = plyRef.current;
    if (p >= moves.length) return;
    const g = gameRef.current;
    let m = null;
    try {
      m = g.move(moves[p].san);
    } catch {
      m = null;
    }
    if (m) {
      sound.forSan(m.san);
      setLastMove({ from: m.from, to: m.to });
    }
    setFen(g.fen());
    setFeedback(null);
    setPly(p + 1);
  }, [moves]);

  // Auto-play the opponent's real moves; pause on your move and during feedback.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (ply >= moves.length) {
      setPhase('done');
      return;
    }
    if (feedback) return;
    if (moves[ply].color === side) return; // your turn
    const t = window.setTimeout(applyActual, 650);
    return () => window.clearTimeout(t);
  }, [phase, ply, side, feedback, moves, applyActual]);

  const yourTurn = phase === 'playing' && ply < moves.length && moves[ply].color === side && !feedback;

  const start = (s: 'w' | 'b') => {
    gameRef.current = new Chess();
    setSide(s);
    setPly(0);
    plyRef.current = 0;
    setFen(START_FEN);
    setLastMove(null);
    setScore(0);
    setAsked(0);
    setFeedback(null);
    setPhase('playing');
  };

  const onGuess = (from: string, to: string, promotion?: string): boolean => {
    if (!yourTurn) return false;
    const test = new Chess(fen);
    let mv;
    try {
      mv = test.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!mv) return false;
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const actual = moves[ply];
    const correct = uci === actual.uci;
    const better = !correct && !!actual.bestUci && uci === actual.bestUci;
    setAsked((a) => a + 1);
    if (correct || better) setScore((s) => s + 1);
    setFeedback({
      kind: correct ? 'correct' : better ? 'better' : 'wrong',
      text: correct
        ? `Correct — ${actual.san}`
        : better
          ? `Even better! The game went ${actual.san}.`
          : `Not it — the game went ${actual.san} (you tried ${mv.san}).`,
    });
    window.setTimeout(applyActual, correct ? 600 : 1200);
    return false;
  };

  const captured = useMemo(() => computeCaptured(fen), [fen]);
  const orientation = side === 'w' ? 'white' : 'black';
  const topSide: 'w' | 'b' = side === 'w' ? 'b' : 'w';
  const moveNo = ply < moves.length ? moves[ply].moveNumber : 0;
  const pct = asked > 0 ? Math.round((score / asked) * 100) : 0;

  if (phase === 'choose') {
    return (
      <div className="intake">
        <h2 style={{ margin: 0 }}>Guess the Move</h2>
        <p className="note" style={{ marginTop: 0 }}>
          Play through the game and try to find each of your moves — the opponent's replies play
          themselves. You score for matching the move played (or the engine's best).
        </p>
        <div className="row">
          <button className="primary" onClick={() => start('w')}>Guess White's moves</button>
          <button className="primary" onClick={() => start('b')}>Guess Black's moves</button>
          <button onClick={onExit}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="review">
      <div>
        <div
          className={`top-hint ${feedback ? (feedback.kind === 'wrong' ? 'muted' : '') : yourTurn ? '' : 'muted'}`}
        >
          {phase === 'done'
            ? `Done! You scored ${score} / ${asked} (${pct}%).`
            : feedback
              ? feedback.text
              : yourTurn
                ? `Your move — find ${side === 'w' ? 'White' : 'Black'}'s move ${moveNo}.`
                : 'Opponent is moving…'}
        </div>
        <div className="board-col" ref={boardCol}>
          <div className="board-stack">
            <div className="player-bar" style={{ width: boardWidth }}>
              <span className="player-name">Opponent</span>
              <div className="player-captured"><CapturedTray info={captured} side={topSide} /></div>
            </div>
            <div className="board-wrap">
              <Board
                fen={fen}
                playedFrom={lastMove?.from}
                playedTo={lastMove?.to}
                boardWidth={boardWidth}
                boardOrientation={orientation}
                onPieceDrop={yourTurn ? onGuess : undefined}
                userColor={side}
              />
            </div>
            <div className="player-bar" style={{ width: boardWidth }}>
              <span className="player-name">You ({side === 'w' ? 'White' : 'Black'})</span>
              <div className="player-captured"><CapturedTray info={captured} side={side} /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="side-col">
        <div className="card">
          <h3>Guess the Move</h3>
          <div className="guess-score">
            <div><b>{score}</b><span>correct</span></div>
            <div><b>{asked}</b><span>tried</span></div>
            <div><b>{pct}%</b><span>rate</span></div>
          </div>
          {phase === 'done' && (
            <p className="note" style={{ marginTop: 12 }}>
              You found {score} of {asked} moves. Play again to beat it.
            </p>
          )}
          <div className="play-buttons" style={{ marginTop: 12 }}>
            <button onClick={() => setPhase('choose')}>↻ Restart</button>
            <button onClick={onExit}>← Back to review</button>
          </div>
        </div>
      </div>
    </div>
  );
}
