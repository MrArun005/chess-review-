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

interface Props {
  /** Hand the finished game's PGN to the review flow. */
  onReview: (pgn: string) => void;
}

export function PlayMode({ onReview }: Props) {
  const gameRef = useRef(new Chess());
  const engineRef = useRef<Engine | null>(null);

  const [fen, setFen] = useState(START_FEN);
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [userColor, setUserColor] = useState<Color>('w');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [levelIdx, setLevelIdx] = useState(2);
  const [colorChoice, setColorChoice] = useState<'w' | 'b' | 'random'>('w');
  const [hintUci, setHintUci] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [boardWidth, setBoardWidth] = useState(440);

  // Refs mirror state that the async engine callbacks read, to avoid stale closures.
  const levelRef = useRef(levelIdx);
  levelRef.current = levelIdx;
  const userColorRef = useRef(userColor);
  userColorRef.current = userColor;

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
  useEffect(() => () => engineRef.current?.dispose(), []);

  const sync = useCallback(() => {
    const g = gameRef.current;
    setFen(g.fen());
    setHistorySan(g.history());
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
      setLastMove({ from: mv.from, to: mv.to });
      sync();
      if (gameRef.current.isGameOver()) finish();
    },
    [sync, finish]
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
      /* engine error — leave it to the user */
    }
    setThinking(false);
    if (!uci) return;
    try {
      const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] as 'q') || 'q' });
      if (mv) afterMove(mv);
    } catch {
      /* illegal engine move (shouldn't happen) */
    }
  }, [afterMove]);

  const newGame = useCallback(
    (choice: 'w' | 'b' | 'random') => {
      gameRef.current = new Chess();
      const color: Color = choice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
      gameRef.current.header(
        'White',
        color === 'w' ? 'You' : 'Engine',
        'Black',
        color === 'b' ? 'You' : 'Engine',
        'Event',
        'Play vs Engine'
      );
      setUserColor(color);
      userColorRef.current = color;
      setOrientation(color === 'w' ? 'white' : 'black');
      setResult(null);
      setHintUci(null);
      setLastMove(null);
      setThinking(false);
      setFen(gameRef.current.fen());
      setHistorySan([]);
      if (color === 'b') void engineMove(); // engine (White) moves first
    },
    [engineMove]
  );

  const onDrop = useCallback(
    (from: string, to: string): boolean => {
      const g = gameRef.current;
      if (thinking || g.isGameOver()) return false;
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
    g.undo(); // undo the engine's reply
    if (g.turn() !== userColorRef.current && g.history().length > 0) g.undo();
    setResult(null);
    setLastMove(null);
    sync();
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

  const started = historySan.length > 0 || result !== null;
  const yourTurn =
    !result && !thinking && gameRef.current.turn() === userColor && !gameRef.current.isGameOver();

  return (
    <div className="review">
      <div>
        <div className="board-col" ref={boardCol}>
          <div className="board-wrap">
            <Board
              fen={fen}
              bestUci={hintUci}
              playedFrom={lastMove?.from}
              playedTo={lastMove?.to}
              boardWidth={boardWidth}
              boardOrientation={orientation}
              onPieceDrop={onDrop}
            />
          </div>
        </div>
        <div className="nav">
          <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
            ⇅ Flip
          </button>
          <button onClick={takeback} disabled={!started || thinking}>
            ↶ Takeback
          </button>
          <button onClick={hint} disabled={!yourTurn}>
            💡 Hint
          </button>
          <button onClick={resign} disabled={!started || result !== null}>
            🏳 Resign
          </button>
        </div>
      </div>

      <div className="side-col">
        <div className="card">
          <h3>Play the engine</h3>
          <div className="play-controls">
            <label>
              Strength
              <select value={levelIdx} onChange={(e) => setLevelIdx(Number(e.target.value))}>
                {LEVELS.map((l, i) => (
                  <option key={i} value={i}>
                    {l.label}
                  </option>
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
            <p className="note" style={{ margin: 0 }}>
              Engine is thinking…
            </p>
          ) : started ? (
            <p className="note" style={{ margin: 0 }}>
              {yourTurn ? 'Your move.' : 'Waiting…'}
            </p>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              Pick a strength and colour, then hit New game. Drag a piece to move.
            </p>
          )}
          {result && (
            <button style={{ marginTop: 10 }} onClick={() => onReview(gameRef.current.pgn())}>
              🔍 Review this game
            </button>
          )}
        </div>

        {historySan.length > 0 && (
          <div className="card">
            <h3>Moves</h3>
            <div className="play-moves">{formatMoves(historySan)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatMoves(san: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < san.length; i += 2) {
    const n = i / 2 + 1;
    out.push(`${n}. ${san[i]}${san[i + 1] ? ' ' + san[i + 1] : ''}`);
  }
  return out.join('  ');
}
