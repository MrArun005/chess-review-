import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Board } from './Board';
import { sound } from './sound';
import type { Puzzle } from '../review/puzzles';

interface Props {
  puzzles: Puzzle[];
  onExit: () => void;
}

type Status = 'solving' | 'solved' | 'revealed';

/**
 * Replay your own mistakes as puzzles: the position before each blunder is set
 * up and you have to find the move the engine wanted. Judging is a straight UCI
 * comparison against the best move the review already computed — no engine here.
 */
export function PuzzleTrainer({ puzzles, onExit }: Props) {
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<Status>('solving');
  const [attempts, setAttempts] = useState(0);
  const [wrongSan, setWrongSan] = useState<string | null>(null);
  const [shownFen, setShownFen] = useState(puzzles[0]?.fen ?? '');
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [boardWidth, setBoardWidth] = useState(440);
  const boardCol = useRef<HTMLDivElement>(null);

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
    setLastMove(null);
    setShownFen(puzzle?.fen ?? '');
  }, [idx, puzzle]);

  const solved = useMemo(() => new Set<number>(), []);

  if (!puzzle) return null;

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
      setShownFen(c.fen());
      setLastMove({ from: mv.from, to: mv.to });
      setStatus('solved');
      solved.add(idx);
      return true;
    }
    // Wrong — let them try again (snap the piece back).
    setWrongSan(mv.san);
    setAttempts((a) => a + 1);
    return false;
  };

  const reveal = () => {
    const c = new Chess(puzzle.fen);
    const from = puzzle.solutionUci.slice(0, 2);
    const to = puzzle.solutionUci.slice(2, 4);
    const promo = puzzle.solutionUci[4];
    try {
      const mv = c.move({ from, to, promotion: (promo as never) || 'q' });
      if (mv) {
        sound.forSan(mv.san);
        setShownFen(c.fen());
        setLastMove({ from: mv.from, to: mv.to });
      }
    } catch {
      /* ignore */
    }
    setStatus('revealed');
  };

  const go = (delta: number) => setIdx((i) => Math.max(0, Math.min(puzzles.length - 1, i + delta)));

  const done = status !== 'solving';
  const solvedClean = status === 'solved' && attempts === 0;

  return (
    <>
      <div className="puzzle-head">
        <button onClick={onExit}>← Back to review</button>
        <span className="note">
          Puzzle {idx + 1} / {puzzles.length}
        </span>
      </div>

      <div className="review">
        <div>
          <div className="board-col" ref={boardCol}>
            <div className="board-wrap">
              <Board
                fen={shownFen}
                playedFrom={lastMove?.from}
                playedTo={lastMove?.to}
                boardWidth={boardWidth}
                boardOrientation={puzzle.color === 'w' ? 'white' : 'black'}
                onPieceDrop={status === 'solving' ? play : undefined}
              />
            </div>
          </div>
          <div className="nav">
            <button onClick={() => go(-1)} disabled={idx === 0}>← Prev</button>
            <button onClick={() => go(1)} disabled={idx === puzzles.length - 1}>Next →</button>
          </div>
        </div>

        <div className="side-col">
          <div className="card">
            <h3>Find the best move</h3>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
              {puzzle.color === 'w' ? 'White' : 'Black'} to move.
            </p>
            <p className="note" style={{ marginTop: 0 }}>
              Move {puzzle.moveNumber}: instead of <b>{puzzle.playedSan}</b> ({label(puzzle.classification)}),
              there was something better. Play it on the board.
            </p>

            {status === 'solving' && wrongSan && (
              <div className="puzzle-feedback wrong">
                <b>{wrongSan}</b> isn't it — try again.
              </div>
            )}
            {status === 'solved' && (
              <div className="puzzle-feedback right">
                {solvedClean ? '✓ Correct!' : '✓ Got it'} — best move was <b>{puzzle.solutionSan}</b>.
                {puzzle.explanation && (
                  <div className="note" style={{ marginTop: 5 }}>
                    Why <b>{puzzle.playedSan}</b> failed: {puzzle.explanation}
                  </div>
                )}
              </div>
            )}
            {status === 'revealed' && (
              <div className="puzzle-feedback reveal">
                Best move was <b>{puzzle.solutionSan}</b>.
                {puzzle.explanation && (
                  <div className="note" style={{ marginTop: 5 }}>
                    Why <b>{puzzle.playedSan}</b> failed: {puzzle.explanation}
                  </div>
                )}
              </div>
            )}

            <div className="puzzle-actions">
              {status === 'solving' && (
                <button onClick={reveal}>Show solution</button>
              )}
              {done && idx < puzzles.length - 1 && (
                <button className="primary" onClick={() => go(1)}>Next puzzle →</button>
              )}
              {done && idx === puzzles.length - 1 && (
                <button className="primary" onClick={onExit}>Finish</button>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Your mistakes</h3>
            <div className="puzzle-list">
              {puzzles.map((p, i) => (
                <button
                  key={i}
                  className={`puzzle-chip ${i === idx ? 'active' : ''} ${solved.has(i) ? 'done' : ''}`}
                  onClick={() => setIdx(i)}
                  title={`Move ${p.moveNumber}: ${p.playedSan}`}
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

function label(cls: string): string {
  return cls === 'blunder' ? 'a blunder' : cls === 'miss' ? 'a missed win' : 'a mistake';
}
