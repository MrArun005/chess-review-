import { useCallback, useEffect, useRef, useState } from 'react';
import { Intake } from './ui/Intake';
import { Board } from './ui/Board';
import { EvalBar } from './ui/EvalBar';
import { EvalGraph } from './ui/EvalGraph';
import { MoveList } from './ui/MoveList';
import { MoveDetail } from './ui/MoveDetail';
import { Summary } from './ui/Summary';
import { KeyMoments } from './ui/KeyMoments';
import { reviewGame, type ReviewResult, type ReviewProgress } from './review/pipeline';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function App() {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(-1); // ply index; -1 = start
  const [boardWidth, setBoardWidth] = useState(440);
  const boardCol = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Responsive board sizing.
  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth - 34; // leave room for the eval bar + gap
      setBoardWidth(Math.max(240, Math.min(560, w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [result]);

  const startReview = useCallback(async (pgn: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setError(null);
    setResult(null);
    setProgress(null);
    setReviewing(true);
    setCurrent(-1);

    try {
      const r = await reviewGame(pgn, {
        signal: ac.signal,
        onProgress: (p) => setProgress(p),
      });
      if (!ac.signal.aborted) {
        setResult(r);
        setCurrent(r.moves.length ? 0 : -1);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(explainError(e));
      }
    } finally {
      setReviewing(false);
    }
  }, []);

  const reset = () => {
    abortRef.current?.abort();
    setResult(null);
    setError(null);
    setProgress(null);
    setReviewing(false);
  };

  // Keyboard navigation.
  const moveCount = result?.moves.length ?? 0;
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(moveCount - 1, c + 1));
      else if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(-1, c - 1));
      else if (e.key === 'ArrowDown') setCurrent((c) => Math.min(moveCount - 1, c + 10));
      else if (e.key === 'ArrowUp') setCurrent((c) => Math.max(-1, c - 10));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, moveCount]);

  const move = current >= 0 && result ? result.moves[current] : null;
  const fen = move ? move.fenAfter : START_FEN;
  const winWhite = result
    ? result.evalSeries[current + 1] ?? result.evalSeries[0] ?? 50
    : 50;

  return (
    <div className="app">
      <h1>♟ Chess Review</h1>
      <div className="tag">
        Game review in your browser — eval, move grades, and plain-English
        explanations. No backend, no login, no limits.
      </div>

      {!result && !reviewing && <Intake onPgn={startReview} />}

      {reviewing && (
        <div className="intake">
          <p>Analyzing…</p>
          {progress && (
            <>
              <div className="progress">
                <div
                  style={{
                    width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="note">
                {progress.phase === 'scan' ? 'Scanning positions' : 'Deep analysis'} ·{' '}
                {progress.done}/{progress.total}
              </p>
            </>
          )}
          <button onClick={reset}>Cancel</button>
        </div>
      )}

      {error && !reviewing && (
        <div className="intake">
          <div className="error">{error}</div>
          <button onClick={reset}>Back</button>
        </div>
      )}

      {result && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button onClick={reset}>← New game</button>
          </div>
          <div className="review">
            <div>
              <div className="board-col" ref={boardCol}>
                <EvalBar winWhite={winWhite} />
                <div className="board-wrap">
                  <Board
                    fen={fen}
                    bestUci={move?.bestUci}
                    playedFrom={move?.uci.slice(0, 2)}
                    playedTo={move?.uci.slice(2, 4)}
                    playedClass={move?.classification}
                    boardWidth={boardWidth}
                  />
                </div>
              </div>
              <div className="nav">
                <button onClick={() => setCurrent(-1)}>⏮</button>
                <button onClick={() => setCurrent((c) => Math.max(-1, c - 1))}>←</button>
                <button onClick={() => setCurrent((c) => Math.min(moveCount - 1, c + 1))}>→</button>
                <button onClick={() => setCurrent(moveCount - 1)}>⏭</button>
              </div>
              <div className="card" style={{ marginTop: 10 }}>
                <h3>Evaluation</h3>
                <EvalGraph
                  series={result.evalSeries}
                  classes={result.moves.map((m) => m.classification)}
                  current={current + 1}
                  onSeek={(p) => setCurrent(Math.max(-1, Math.min(moveCount - 1, p - 1)))}
                />
              </div>
            </div>

            <div className="side-col">
              <Summary moves={result.moves} openingName={result.openingName} />
              <MoveDetail move={move} />
              <div className="card">
                <h3>Moves</h3>
                <MoveList moves={result.moves} current={current} onSelect={setCurrent} />
              </div>
              <KeyMoments moves={result.moves} onSelect={setCurrent} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function explainError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/stockfish|worker|engine/i.test(msg)) {
    return (
      msg +
      '  — the Stockfish engine could not start. Run `npm install` (which copies ' +
      'the engine into public/engine) and make sure the dev server sets the ' +
      'cross-origin isolation headers.'
    );
  }
  if (/pgn|move|fen/i.test(msg)) return `Could not read that PGN: ${msg}`;
  return msg;
}
