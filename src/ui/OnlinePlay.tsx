import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import { Board } from './Board';
import { CapturedTray, computeCaptured } from './Captured';
import { sound } from './sound';
import { friendLink, pgnFromFriendHash, copyText } from './exportImage';

/**
 * Play a friend by link — correspondence chess with no server and no live
 * connection to fail. You make a move, get a link, and send it to your friend
 * (WhatsApp, iMessage, anywhere). They open it, see your move, reply, and send
 * a link back. Each link carries the whole game and hands the turn to whoever
 * opens it, so it works on any device and any network.
 */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type Color = 'w' | 'b';

export function OnlinePlay() {
  const gameRef = useRef(new Chess());
  const [phase, setPhase] = useState<'menu' | 'playing'>('menu');
  const [fen, setFen] = useState(START_FEN);
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [myColor, setMyColor] = useState<Color>('w');
  const [myTurn, setMyTurn] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [boardWidth, setBoardWidth] = useState(440);
  const boardCol = useRef<HTMLDivElement>(null);

  // Load a game handed over by a link — on mount, and whenever the hash changes
  // (tapping a new link while the app is already open only changes the hash, it
  // doesn't reload the page).
  useEffect(() => {
    const loadFromHash = () => {
      void pgnFromFriendHash().then((pgn) => {
        if (pgn === null) return;
        const g = new Chess();
        try {
          if (pgn.trim()) g.loadPgn(pgn);
        } catch {
          return;
        }
        gameRef.current = g;
        setMyColor(g.turn() === 'w' ? 'w' : 'b');
        setPhase('playing');
        setMyTurn(!g.isGameOver());
        setLink(null);
        setCopied(false);
        refreshFrom(g);
        // Clear the hash so a refresh doesn't reload a stale position.
        history.replaceState(null, '', location.pathname + location.search);
      });
    };
    loadFromHash();
    window.addEventListener('hashchange', loadFromHash);
    return () => window.removeEventListener('hashchange', loadFromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = boardCol.current;
    if (!el) return;
    const compute = () => {
      const viewH = window.innerHeight - 220;
      setBoardWidth(Math.max(240, Math.min(720, el.clientWidth, viewH)));
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

  function refreshFrom(g: Chess) {
    setFen(g.fen());
    setHistorySan(g.history());
    const verbose = g.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setResult(gameResult(g));
  }

  const startGame = (youFirst: boolean) => {
    const g = new Chess();
    gameRef.current = g;
    setMyColor('w');
    setPhase('playing');
    setResult(null);
    setLink(null);
    refreshFrom(g);
    if (youFirst) {
      // You are White and to move now.
      setMyTurn(true);
    } else {
      // Friend plays White — hand them the opening link straight away.
      setMyColor('b');
      setMyTurn(false);
      void makeLink(g);
    }
  };

  const makeLink = async (g: Chess) => {
    const url = await friendLink(g.pgn());
    setLink(url);
  };

  const onDrop = (from: string, to: string, promotion?: string): boolean => {
    if (!myTurn || result) return false;
    const g = gameRef.current;
    if (g.turn() !== myColor) return false;
    let mv: Move | null = null;
    try {
      mv = g.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!mv) return false;
    sound.forSan(mv.san);
    setLastMove({ from: mv.from, to: mv.to });
    setMyTurn(false);
    refreshFrom(g);
    if (!g.isGameOver()) void makeLink(g);
    else setLink(null);
    return true;
  };

  const copy = async () => {
    if (!link) return;
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const shareNative = async () => {
    if (!link) return;
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'Your move — Chess', url: link });
        return;
      } catch {
        /* user cancelled / unsupported */
      }
    }
    void copy();
  };

  const captured = useMemo(() => computeCaptured(fen), [fen]);
  const topSide: Color = myColor === 'w' ? 'b' : 'w';

  if (phase === 'menu') {
    return (
      <div className="intake">
        <h2 style={{ margin: 0 }}>Play a friend by link</h2>
        <p className="note" style={{ marginTop: 0 }}>
          No account, no server, works on any device. Make a move, then send your friend the link
          (WhatsApp, iMessage, anywhere). They open it, play their reply, and send a link back. Each
          link carries the whole game.
        </p>
        <div className="row">
          <button className="primary" onClick={() => startGame(true)}>Start — I play White</button>
          <button onClick={() => startGame(false)}>Let my friend play White</button>
        </div>
      </div>
    );
  }

  const waiting = !myTurn && !result;

  return (
    <div className="review">
      <div>
        <div className={`top-hint ${myTurn ? '' : 'muted'}`}>
          {result
            ? result
            : myTurn
              ? `Your move — you're ${myColor === 'w' ? 'White' : 'Black'}.`
              : 'Move made — send the link to your friend.'}
        </div>
        <div className="board-col" ref={boardCol}>
          <div className="board-stack">
            <div className="player-bar" style={{ width: boardWidth }}>
              <span className="player-name">Friend</span>
              <div className="player-captured">
                <CapturedTray info={captured} side={topSide} />
              </div>
            </div>
            <div className="board-wrap">
              <Board
                fen={fen}
                playedFrom={lastMove?.from}
                playedTo={lastMove?.to}
                boardWidth={boardWidth}
                boardOrientation={myColor === 'w' ? 'white' : 'black'}
                onPieceDrop={myTurn && !result ? onDrop : undefined}
                userColor={myColor}
              />
            </div>
            <div className="player-bar" style={{ width: boardWidth }}>
              <span className="player-name">You ({myColor === 'w' ? 'White' : 'Black'})</span>
              <div className="player-captured">
                <CapturedTray info={captured} side={myColor} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="side-col">
        {waiting && link && (
          <div className="card">
            <h3>Send this to your friend</h3>
            <p className="note" style={{ marginTop: 0 }}>
              They open it, play their move, and send a link back.
            </p>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="link-box" />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={shareNative}>📤 Share</button>
              <button onClick={copy}>{copied ? '✓ Copied' : '📋 Copy link'}</button>
            </div>
          </div>
        )}

        {result && (
          <div className="card">
            <h3>Game over</h3>
            <p style={{ margin: 0, fontWeight: 600 }}>{result}</p>
          </div>
        )}

        <div className="card">
          <h3>How it works</h3>
          <p className="note" style={{ margin: 0 }}>
            When your friend's reply link arrives, open it and it'll be your move again. You can keep
            a game going for as long as you like — nothing expires.
          </p>
          <button style={{ marginTop: 10 }} onClick={() => setPhase('menu')}>← New game</button>
        </div>

        {historySan.length > 0 && (
          <div className="card">
            <h3>Moves</h3>
            <div className="play-moves">{historySan.join(' ')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function gameResult(g: Chess): string | null {
  if (!g.isGameOver()) return null;
  if (g.isCheckmate()) {
    const loser = g.turn();
    return `Checkmate — ${loser === 'w' ? 'Black' : 'White'} wins.`;
  }
  if (g.isStalemate()) return 'Stalemate — draw.';
  if (g.isInsufficientMaterial()) return 'Draw — insufficient material.';
  if (g.isDraw()) return 'Draw.';
  return 'Game over.';
}
