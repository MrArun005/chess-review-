import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { Engine } from '../engine/analyzer';
import { sound } from './sound';

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
  const engineRef = useRef<Engine | null>(null);

  // Position history so you can step back through the game.
  const [positions, setPositions] = useState<string[]>([START_FEN]);
  const [moveSquares, setMoveSquares] = useState<Sq[]>([]);
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [viewIdx, setViewIdx] = useState(0); // index into positions

  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [userColor, setUserColor] = useState<Color>('w');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [levelIdx, setLevelIdx] = useState(2);
  const [colorChoice, setColorChoice] = useState<'w' | 'b' | 'random'>('w');
  const [hintUci, setHintUci] = useState<string | null>(null);
  const [boardWidth, setBoardWidth] = useState(440);

  const isLive = viewIdx === positions.length - 1;

  // Refs mirror state the async engine callbacks / event handlers read.
  const levelRef = useRef(levelIdx);
  levelRef.current = levelIdx;
  const userColorRef = useRef(userColor);
  userColorRef.current = userColor;
  const liveRef = useRef(isLive);
  liveRef.current = isLive;

  const boardCol = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBoardWidth(Math.max(240, Math.min(560, el.clientWidth)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const getEngine = () => {
    if (!engineRef.current) engineRef.current = new Engine();
    return engineRef.current;
  };
  // Pre-warm the engine as soon as Play opens, so the first move doesn't wait
  // ~30s for the worker + neural net to load.
  useEffect(() => {
    void getEngine()
      .init()
      .catch(() => {});
    return () => engineRef.current?.dispose();
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
      setHintUci(null);
      setThinking(false);
      setPositions([gameRef.current.fen()]);
      setMoveSquares([]);
      setHistorySan([]);
      setViewIdx(0);
      if (color === 'b') void engineMove(); // engine (White) moves first
    },
    [engineMove]
  );

  const onDrop = useCallback(
    (from: string, to: string): boolean => {
      const g = gameRef.current;
      if (thinking || g.isGameOver() || !liveRef.current) return false;
      if (g.turn() !== userColorRef.current) return false;
      let mv: Move | null = null;
      try {
        mv = g.move({ from, to, promotion: 'q' });
      } catch {
        return false;
      }
      if (!mv) return false;
      afterMove(mv);
      if (!g.isGameOver()) window.setTimeout(() => void engineMove(), 150);
      return true;
    },
    [thinking, afterMove, engineMove]
  );

  const takeback = () => {
    const g = gameRef.current;
    if (g.history().length === 0 || thinking) return;
    g.undo(); // engine's reply
    if (g.turn() !== userColorRef.current && g.history().length > 0) g.undo();
    setResult(null);
    rebuild();
  };

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

  const rows: { num: number; w?: { san: string; idx: number }; b?: { san: string; idx: number } }[] = [];
  for (let i = 0; i < historySan.length; i += 2) {
    rows.push({
      num: i / 2 + 1,
      w: { san: historySan[i], idx: i + 1 },
      b: historySan[i + 1] ? { san: historySan[i + 1], idx: i + 2 } : undefined,
    });
  }

  return (
    <div className="review">
      <div>
        <div className="board-col" ref={boardCol}>
          <div className="board-wrap">
            <Board
              fen={positions[viewIdx]}
              bestUci={isLive ? hintUci : null}
              playedFrom={viewIdx > 0 ? moveSquares[viewIdx - 1]?.from : undefined}
              playedTo={viewIdx > 0 ? moveSquares[viewIdx - 1]?.to : undefined}
              boardWidth={boardWidth}
              boardOrientation={orientation}
              onPieceDrop={onDrop}
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
        {!isLive && (
          <p className="note" style={{ textAlign: 'center', marginTop: 6 }}>
            Viewing an earlier move — jump to the latest position (⏭) to keep playing.
          </p>
        )}
      </div>

      <div className="side-col">
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
          </div>
          <button className="primary" style={{ marginTop: 10 }} onClick={() => newGame(colorChoice)}>
            New game
          </button>
        </div>

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
          </div>
          {result && (
            <button style={{ marginTop: 10, width: '100%' }} onClick={() => onReview(gameRef.current.pgn())}>
              🔍 Review this game
            </button>
          )}
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
    </div>
  );
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
