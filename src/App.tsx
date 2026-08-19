import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Intake } from './ui/Intake';
import { Board } from './ui/Board';
import { EvalBar } from './ui/EvalBar';
import { EvalGraph } from './ui/EvalGraph';
import { MoveList } from './ui/MoveList';
import { MoveDetail } from './ui/MoveDetail';
import { Summary } from './ui/Summary';
import { KeyMoments } from './ui/KeyMoments';
import { EngineLines } from './ui/EngineLines';
import { PlayMode } from './ui/PlayMode';
import { AnalyzeMode } from './ui/AnalyzeMode';
import { OfflineButton } from './ui/OfflineButton';
import { CapturedTray, computeCaptured } from './ui/Captured';
import { sound } from './ui/sound';
import { useExplore } from './ui/useExplore';
import { useAnalysisEngine } from './ui/useAnalysisEngine';
import { exportSummaryPng, shareLink, pgnFromHash, copyText } from './ui/exportImage';
import { reviewGame, type ReviewResult, type ReviewProgress } from './review/pipeline';
import { recordGame } from './review/weakness';
import { Weakness } from './ui/Weakness';
import { buildPuzzles } from './review/puzzles';
import { PuzzleTrainer } from './ui/PuzzleTrainer';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function App() {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(-1); // ply index; -1 = start
  const [boardWidth, setBoardWidth] = useState(440);
  const [muted, setMuted] = useState(sound.isMuted());
  const [pgn, setPgn] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const [mode, setMode] = useState<'review' | 'play'>('review');
  const [analyzeFen, setAnalyzeFen] = useState<string | null>(null);
  const [training, setTraining] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('cr-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('cr-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const boardCol = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevPly = useRef<number>(-2);

  const analyze = useAnalysisEngine();
  const { explore, tryMove, reset: resetExplore } = useExplore(analyze);

  // Responsive board sizing — grow to fill the screen. A board is square, so
  // the limit is whichever is smaller: the column width or the viewport height
  // (minus room for the masthead + nav below it).
  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const compute = () => {
      const colW = el.clientWidth - 34; // leave room for the eval bar + gap
      const viewH = window.innerHeight - 200;
      setBoardWidth(Math.max(240, Math.min(880, colW, viewH)));
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    compute();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [result]);

  const startReview = useCallback(
    async (pgn: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      resetExplore();
      setPgn(pgn);
      setError(null);
      setResult(null);
      setProgress(null);
      setReviewing(true);
      setTraining(false);
      setCurrent(-1);

      try {
        const r = await reviewGame(pgn, {
          signal: ac.signal,
          onProgress: (p) => setProgress(p),
        });
        if (!ac.signal.aborted) {
          setResult(r);
          setCurrent(r.moves.length ? 0 : -1);
          // Fold this game's mistakes into the cross-game weakness tally.
          try {
            recordGame(r);
          } catch {
            /* localStorage may be unavailable — non-fatal */
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError(explainError(e));
        }
      } finally {
        setReviewing(false);
      }
    },
    [resetExplore]
  );

  const reset = () => {
    abortRef.current?.abort();
    resetExplore();
    setResult(null);
    setError(null);
    setProgress(null);
    setReviewing(false);
    setTraining(false);
  };

  const moveCount = result?.moves.length ?? 0;
  const puzzles = useMemo(() => (result ? buildPuzzles(result) : []), [result]);

  // Navigate the reviewed game; any navigation exits exploration.
  const goTo = useCallback(
    (ply: number) => {
      resetExplore();
      setCurrent(Math.max(-1, Math.min(moveCount - 1, ply)));
    },
    [resetExplore, moveCount]
  );
  const step = useCallback(
    (delta: number) => {
      resetExplore();
      setCurrent((c) => Math.max(-1, Math.min(moveCount - 1, c + delta)));
    },
    [resetExplore, moveCount]
  );

  const toggleMute = () => {
    const m = !muted;
    sound.setMuted(m);
    setMuted(m);
  };

  // Keyboard navigation.
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowDown') step(10);
      else if (e.key === 'ArrowUp') step(-10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, step]);

  // Play a sound as you step through the game (skip the initial load).
  useEffect(() => {
    if (!result) {
      prevPly.current = -2;
      return;
    }
    if (prevPly.current === current) return;
    const first = prevPly.current === -2;
    prevPly.current = current;
    if (first) return;
    if (current >= 0) sound.forSan(result.moves[current].san);
    else sound.move();
  }, [current, result]);

  // Auto-load a game from a shared URL (#g=... or #pgn=...).
  useEffect(() => {
    void pgnFromHash().then((shared) => {
      if (shared) void startReview(shared);
    });
  }, [startReview]);

  const copyLink = async () => {
    if (!pgn) return;
    const url = await shareLink(pgn);
    const ok = await copyText(url);
    if (ok) {
      setShareFallback(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      // Couldn't copy (e.g. blocked) — reveal the link for manual copy.
      setShareFallback(url);
    }
  };

  const move = current >= 0 && result ? result.moves[current] : null;

  const displayFen = explore ? explore.fen : move ? move.fenAfter : START_FEN;
  const winWhite = explore
    ? explore.analysis?.winWhite ?? (result?.evalSeries[current + 1] ?? 50)
    : result
      ? result.evalSeries[current + 1] ?? result.evalSeries[0] ?? 50
      : 50;
  const bestUci = explore ? explore.analysis?.bestUci ?? null : move?.bestUci ?? null;
  const hlFrom = explore ? explore.lastMove.from : move?.uci.slice(0, 2);
  const hlTo = explore ? explore.lastMove.to : move?.uci.slice(2, 4);

  // Detect a finished game at the position on screen (for the checkmate sign).
  const gameEnd = detectGameEnd(result ? displayFen : null, explore !== null);

  // Captured pieces + material advantage for the position on screen.
  const captured = computeCaptured(displayFen);

  return (
    <div className="app">
      <div className="masthead">
        <div>
          <h1>
            <span className="logo">♟</span> Chess Review
          </h1>
          <p className="tag">
            Game review in your browser — eval, move grades, and plain-English
            explanations. No backend, no login, no limits.
          </p>
        </div>
        <div className="toolbar">
          <div className="segmented">
            <button
              className={mode === 'review' ? 'active' : ''}
              onClick={() => setMode('review')}
            >
              Review
            </button>
            <button className={mode === 'play' ? 'active' : ''} onClick={() => setMode('play')}>
              Play
            </button>
          </div>
          <OfflineButton />
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title="Toggle light / dark theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {mode === 'review' && result && (
            <>
              <button onClick={reset}>← New game</button>
              {puzzles.length > 0 && (
                <button
                  onClick={() => setTraining((t) => !t)}
                  className={training ? 'active' : ''}
                  title="Replay your mistakes as puzzles"
                >
                  🧩 Train {puzzles.length}
                </button>
              )}
              <button onClick={toggleMute}>{muted ? '🔇 Sound' : '🔊 Sound'}</button>
              <button onClick={copyLink} disabled={!pgn}>
                {copied ? '✓ Copied' : '🔗 Share'}
              </button>
              <button onClick={() => exportSummaryPng(result)}>🖼 Export</button>
            </>
          )}
        </div>
      </div>

      {mode === 'play' && (
        <PlayMode
          onReview={(p) => {
            setMode('review');
            void startReview(p);
          }}
        />
      )}

      {mode === 'review' && analyzeFen && (
        <AnalyzeMode
          fen={analyzeFen}
          analyze={analyze}
          onExit={() => setAnalyzeFen(null)}
        />
      )}

      {mode === 'review' && !analyzeFen && !result && !reviewing && (
        <>
          <Intake onPgn={startReview} onFen={setAnalyzeFen} />
          <Weakness />
        </>
      )}

      {mode === 'review' && reviewing && (
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

      {mode === 'review' && error && !reviewing && (
        <div className="intake">
          <div className="error">{error}</div>
          <button onClick={reset}>Back</button>
        </div>
      )}

      {mode === 'review' && result && training && (
        <PuzzleTrainer puzzles={puzzles} onExit={() => setTraining(false)} />
      )}

      {mode === 'review' && result && !training && (
        <>
          {shareFallback && (
            <div className="share-fallback">
              <span className="note">Copy this link:</span>
              <input
                readOnly
                value={shareFallback}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button onClick={() => setShareFallback(null)}>Done</button>
            </div>
          )}
          <div className="review">
            <div>
              <CapturedTray info={captured} side={flipped ? 'w' : 'b'} offset={19} />
              <div className="board-col" ref={boardCol}>
                <EvalBar winWhite={winWhite} />
                <div className="board-wrap">
                  <Board
                    fen={displayFen}
                    bestUci={bestUci}
                    playedFrom={hlFrom}
                    playedTo={hlTo}
                    playedClass={explore ? undefined : move?.classification}
                    badge={
                      !explore && move
                        ? { square: move.uci.slice(2, 4), cls: move.classification }
                        : null
                    }
                    mateSquare={gameEnd?.kind === 'mate' ? gameEnd.kingSquare : null}
                    boardWidth={boardWidth}
                    boardOrientation={flipped ? 'black' : 'white'}
                    onPieceDrop={(from, to) => tryMove(displayFen, from, to)}
                  />
                </div>
              </div>
              <CapturedTray info={captured} side={flipped ? 'b' : 'w'} offset={19} />

              {gameEnd && !explore ? (
                <div className={`game-end ${gameEnd.kind}`}>
                  {gameEnd.kind === 'mate'
                    ? `♚ Checkmate — ${gameEnd.winner} wins`
                    : gameEnd.kind === 'stalemate'
                      ? '½ Stalemate — draw'
                      : '½ Draw'}
                </div>
              ) : null}

              {explore ? (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="explore-head">
                    <strong>Your line</strong>
                    <button onClick={resetExplore}>⟲ Back to game</button>
                  </div>
                  <div className="best">{explore.history.join(' ')}</div>
                  {explore.loading ? (
                    <p className="note">Analyzing your move…</p>
                  ) : explore.analysis ? (
                    <p className="note">
                      Eval {Math.round(explore.analysis.winWhite)}% for White · best:{' '}
                      {explore.analysis.lineSan.join(' ') || '—'}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="note" style={{ textAlign: 'center', marginTop: 6 }}>
                  Tip: drag a piece to try your own move and see the engine's reply.
                </p>
              )}

              <div className="nav">
                <button onClick={() => goTo(-1)}>⏮</button>
                <button onClick={() => step(-1)}>←</button>
                <button onClick={() => step(1)}>→</button>
                <button onClick={() => goTo(moveCount - 1)}>⏭</button>
                <button onClick={() => setFlipped((f) => !f)} title="Flip board">⇅</button>
              </div>
              <div className="card" style={{ marginTop: 10 }}>
                <h3>Evaluation</h3>
                <EvalGraph
                  series={result.evalSeries}
                  classes={result.moves.map((m) => m.classification)}
                  current={current + 1}
                  onSeek={(p) => goTo(p - 1)}
                />
              </div>
            </div>

            <div className="side-col">
              <Summary moves={result.moves} openingName={result.openingName} />
              <MoveDetail move={move} />
              <EngineLines
                fen={displayFen}
                analyze={analyze}
                onPlay={(from, to) => tryMove(displayFen, from, to)}
              />
              <div className="card">
                <h3>Moves</h3>
                <MoveList moves={result.moves} current={current} onSelect={goTo} />
              </div>
              <KeyMoments moves={result.moves} onSelect={goTo} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface GameEnd {
  kind: 'mate' | 'stalemate' | 'draw';
  winner: string | null;
  kingSquare: string | null;
}

/** Detect a finished game at `fen` (checkmate/stalemate/draw), for the UI sign. */
function detectGameEnd(fen: string | null, exploring: boolean): GameEnd | null {
  if (!fen || exploring) return null;
  try {
    const c = new Chess(fen);
    if (c.isCheckmate()) {
      const loser = c.turn();
      let kingSquare: string | null = null;
      for (const row of c.board()) {
        for (const cell of row) {
          if (cell?.type === 'k' && cell.color === loser) kingSquare = cell.square;
        }
      }
      return { kind: 'mate', winner: loser === 'w' ? 'Black' : 'White', kingSquare };
    }
    if (c.isStalemate()) return { kind: 'stalemate', winner: null, kingSquare: null };
    if (c.isInsufficientMaterial() || c.isDraw()) {
      return { kind: 'draw', winner: null, kingSquare: null };
    }
  } catch {
    /* not a terminal/loadable position */
  }
  return null;
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
