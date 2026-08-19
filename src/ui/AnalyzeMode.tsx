import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { EvalBar } from './EvalBar';
import { EngineLines } from './EngineLines';
import { CapturedTray, computeCaptured } from './Captured';
import { winPctWhite } from '../review/winpct';
import { sound } from './sound';
import type { AnalyzeFn } from './useAnalysisEngine';

interface Props {
  fen: string;
  analyze: AnalyzeFn;
  onExit: () => void;
}

/**
 * A free analysis board: set up any position (from a FEN), see the engine's
 * evaluation and best line, and drag pieces to explore variations.
 */
export function AnalyzeMode({ fen, analyze, onExit }: Props) {
  const gameRef = useRef(new Chess(fen));
  const [displayFen, setDisplayFen] = useState(fen);
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [best, setBest] = useState<{ uci: string | null; winWhite: number; lineSan: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [orientation, setOrientation] = useState<'white' | 'black'>(
    fen.split(/\s+/)[1] === 'b' ? 'black' : 'white'
  );
  const [boardWidth, setBoardWidth] = useState(440);
  const boardCol = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const compute = () => {
      const colW = el.clientWidth - 34;
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
  }, []);

  const runAnalysis = useCallback(
    async (f: string) => {
      setBusy(true);
      try {
        const a = await analyze(f, { depth: 16, multipv: 1 });
        if (gameRef.current.fen() === f) {
          setBest({ uci: a.best.pv[0] ?? null, winWhite: winPctWhite(a.best), lineSan: pvToSan(f, a.best.pv) });
        }
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [analyze]
  );

  useEffect(() => {
    void runAnalysis(gameRef.current.fen());
  }, [runAnalysis]);

  const sync = () => {
    setDisplayFen(gameRef.current.fen());
    setHistorySan(gameRef.current.history());
  };

  const captured = computeCaptured(displayFen);

  const onDrop = useCallback(
    (from: string, to: string, promotion = 'q'): boolean => {
      let mv: Move | null = null;
      try {
        mv = gameRef.current.move({ from, to, promotion });
      } catch {
        return false;
      }
      if (!mv) return false;
      sound.forSan(mv.san);
      setLastMove({ from: mv.from, to: mv.to });
      setBest(null);
      sync();
      void runAnalysis(gameRef.current.fen());
      return true;
    },
    [runAnalysis]
  );

  const undo = () => {
    if (gameRef.current.history().length === 0) return;
    gameRef.current.undo();
    setLastMove(null);
    setBest(null);
    sync();
    void runAnalysis(gameRef.current.fen());
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <button onClick={onExit}>← Back</button>
      </div>
      <div className="review">
        <div>
          <CapturedTray info={captured} side={orientation === 'white' ? 'b' : 'w'} offset={19} />
          <div className="board-col" ref={boardCol}>
            <EvalBar winWhite={best?.winWhite ?? 50} />
            <div className="board-wrap">
              <Board
                fen={displayFen}
                bestUci={best?.uci}
                playedFrom={lastMove?.from}
                playedTo={lastMove?.to}
                boardWidth={boardWidth}
                boardOrientation={orientation}
                onPieceDrop={onDrop}
              />
            </div>
          </div>
          <CapturedTray info={captured} side={orientation === 'white' ? 'w' : 'b'} offset={19} />
          <div className="nav">
            <button onClick={undo} disabled={historySan.length === 0}>↶ Undo</button>
            <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>⇅ Flip</button>
          </div>
          <p className="note" style={{ textAlign: 'center', marginTop: 6 }}>
            Analysis board — drag pieces to explore. {busy ? 'Analyzing…' : ''}
          </p>
        </div>

        <div className="side-col">
          <div className="card">
            <h3>Best line</h3>
            {best ? (
              <div className="best">{best.lineSan.join(' ') || '—'}</div>
            ) : (
              <p className="note">Analyzing…</p>
            )}
          </div>
          <EngineLines fen={displayFen} analyze={analyze} onPlay={(f, t) => onDrop(f, t)} />
          {historySan.length > 0 && (
            <div className="card">
              <h3>Moves</h3>
              <div className="play-moves">{historySan.join(' ')}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function pvToSan(fen: string, pv: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, 8)) {
    try {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never });
      if (!m) break;
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}
