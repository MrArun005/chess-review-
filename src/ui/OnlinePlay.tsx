import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { DataConnection, Peer } from 'peerjs';
import { Board } from './Board';
import { CapturedTray, computeCaptured } from './Captured';
import { sound } from './sound';

/**
 * Live play against a friend on another device, over WebRTC. Signalling goes
 * through PeerJS's free public server just long enough to connect the two
 * browsers; the moves themselves flow peer-to-peer over a data channel. No
 * account, no game data on any server. peerjs is dynamically imported so it
 * never weighs down the offline review/play bundle.
 */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PREFIX = 'crchess-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type Color = 'w' | 'b';
type Phase = 'menu' | 'hosting' | 'connecting' | 'playing';

type Msg =
  | { t: 'init'; color: Color }
  | { t: 'move'; uci: string; fen: string }
  | { t: 'resign' }
  | { t: 'rematch' };

function makeCode(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/**
 * PeerJS server options. Defaults to PeerJS's free public cloud; a `?peerhost=`
 * URL param points it at a self-hosted signalling server instead (used by the
 * integration test).
 */
function peerOpts(): Record<string, unknown> | undefined {
  try {
    const p = new URLSearchParams(location.search);
    const host = p.get('peerhost');
    if (host) {
      return {
        host,
        port: Number(p.get('peerport') || '9000'),
        path: p.get('peerpath') || '/',
        secure: false,
      };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function OnlinePlay() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [hostColor, setHostColor] = useState<'w' | 'b' | 'random'>('w');
  const [myColor, setMyColor] = useState<Color>('w');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [fen, setFen] = useState(START_FEN);
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [boardWidth, setBoardWidth] = useState(440);

  const gameRef = useRef(new Chess());
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const myColorRef = useRef<Color>('w');
  myColorRef.current = myColor;
  const hostColorRef = useRef(hostColor);
  hostColorRef.current = hostColor;
  const connectedRef = useRef(false);
  connectedRef.current = connected;
  const boardCol = useRef<HTMLDivElement>(null);

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

  // Tear the connection down when leaving the tab.
  useEffect(() => {
    return () => {
      connRef.current?.close();
      peerRef.current?.destroy();
    };
  }, []);

  const sync = useCallback(() => {
    const g = gameRef.current;
    setFen(g.fen());
    setHistorySan(g.history());
    if (g.isGameOver()) {
      if (g.isCheckmate()) {
        const loser = g.turn();
        const youWon = loser !== myColorRef.current;
        setResult(`Checkmate — ${youWon ? 'you win! 🎉' : 'you lose.'}`);
      } else {
        setResult('Draw.');
      }
    }
  }, []);

  const handleData = useCallback(
    (msg: Msg) => {
      if (msg.t === 'init') {
        setMyColor(msg.color);
        myColorRef.current = msg.color;
        return;
      }
      if (msg.t === 'move') {
        const g = gameRef.current;
        try {
          const mv = g.move({
            from: msg.uci.slice(0, 2),
            to: msg.uci.slice(2, 4),
            promotion: (msg.uci[4] as never) || 'q',
          });
          if (mv) {
            sound.forSan(mv.san);
            setLastMove({ from: mv.from, to: mv.to });
          } else {
            g.load(msg.fen);
          }
        } catch {
          g.load(msg.fen);
        }
        sync();
        return;
      }
      if (msg.t === 'resign') {
        setResult('Opponent resigned — you win! 🎉');
        return;
      }
      if (msg.t === 'rematch') {
        resetGame(myColorRef.current === 'w' ? 'b' : 'w', false);
      }
    },
    [sync]
  );

  const send = (msg: Msg) => connRef.current?.send(msg);

  const setupConn = useCallback(
    (conn: DataConnection, asHost: boolean) => {
      connRef.current = conn;
      conn.on('open', () => {
        setConnected(true);
        setPhase('playing');
        setStatus('');
        setError(null);
        if (asHost) {
          const hc: Color =
            hostColorRef.current === 'random'
              ? Math.random() < 0.5
                ? 'w'
                : 'b'
              : hostColorRef.current;
          setMyColor(hc);
          myColorRef.current = hc;
          conn.send({ t: 'init', color: hc === 'w' ? 'b' : 'w' } as Msg);
        }
      });
      conn.on('data', (d) => handleData(d as Msg));
      conn.on('close', () => {
        setConnected(false);
        setStatus('Opponent disconnected.');
      });
    },
    [handleData]
  );

  const resetGame = (mine: Color, announce: boolean) => {
    gameRef.current = new Chess();
    setMyColor(mine);
    myColorRef.current = mine;
    setFen(START_FEN);
    setHistorySan([]);
    setLastMove(null);
    setResult(null);
    setResultDismissed(false);
    if (announce) send({ t: 'rematch' });
  };

  const createRoom = async () => {
    setError(null);
    try {
      const { Peer } = await import('peerjs');
      const c = makeCode();
      setCode(c);
      resetGame(hostColor === 'random' ? 'w' : hostColor, false);
      const peer = new Peer(PREFIX + c, peerOpts());
      peerRef.current = peer;
      peer.on('open', () => {
        setPhase('hosting');
        setStatus('Waiting for a friend to join…');
      });
      peer.on('connection', (conn) => setupConn(conn, true));
      peer.on('error', (e: unknown) => {
        const type = (e as { type?: string }).type;
        if (type === 'unavailable-id') {
          peer.destroy();
          void createRoom(); // code collision — pick another
        } else {
          setError(`Could not create room (${type ?? 'error'}).`);
          setPhase('menu');
        }
      });
    } catch {
      setError('Could not load the connection library. Check your network.');
    }
  };

  const joinRoom = async () => {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 3) return;
    setError(null);
    setPhase('connecting');
    setStatus('Connecting…');
    try {
      const { Peer } = await import('peerjs');
      const peer = new Peer(undefined as unknown as string, peerOpts());
      peerRef.current = peer;
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + c, { reliable: true });
        setupConn(conn, false);
      });
      peer.on('error', (e: unknown) => {
        const type = (e as { type?: string }).type;
        setError(type === 'peer-unavailable' ? 'Room not found — check the code.' : `Connection failed (${type ?? 'error'}).`);
        setPhase('menu');
      });
    } catch {
      setError('Could not load the connection library. Check your network.');
      setPhase('menu');
    }
  };

  const leave = () => {
    connRef.current?.close();
    peerRef.current?.destroy();
    connRef.current = null;
    peerRef.current = null;
    setConnected(false);
    setPhase('menu');
    setStatus('');
    setError(null);
    setCode('');
    resetGame('w', false);
  };

  const onDrop = (from: string, to: string, promotion?: string): boolean => {
    const g = gameRef.current;
    if (result || !connectedRef.current) return false;
    if (g.turn() !== myColorRef.current) return false;
    let mv;
    try {
      mv = g.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!mv) return false;
    sound.forSan(mv.san);
    setLastMove({ from: mv.from, to: mv.to });
    send({ t: 'move', uci: mv.from + mv.to + (mv.promotion ?? ''), fen: g.fen() });
    sync();
    return true;
  };

  const resign = () => {
    if (result || !connected) return;
    send({ t: 'resign' });
    setResult('You resigned — opponent wins.');
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  // ----- render -----
  if (phase === 'menu' || phase === 'hosting' || phase === 'connecting') {
    return (
      <div className="intake">
        <h2 style={{ margin: 0 }}>Play a friend online</h2>
        <p className="note" style={{ marginTop: 0 }}>
          Live game on two devices, peer-to-peer. One of you creates a room and shares the code; the
          other joins with it. No account — the connection is direct between your browsers.
        </p>

        {phase === 'hosting' ? (
          <div className="card">
            <h3>Your room code</h3>
            <div className="room-code">{code}</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button onClick={copyCode}>{copied ? '✓ Copied' : '📋 Copy code'}</button>
              <button onClick={leave}>Cancel</button>
            </div>
            <p className="note" style={{ textAlign: 'center' }}>{status}</p>
          </div>
        ) : phase === 'connecting' ? (
          <div className="card">
            <p className="note" style={{ margin: 0 }}>{status}</p>
            <button style={{ marginTop: 10 }} onClick={leave}>Cancel</button>
          </div>
        ) : (
          <div className="online-menu">
            <div className="card">
              <h3>Create a room</h3>
              <label className="online-field">
                You play
                <select value={hostColor} onChange={(e) => setHostColor(e.target.value as 'w' | 'b' | 'random')}>
                  <option value="w">White</option>
                  <option value="b">Black</option>
                  <option value="random">Random</option>
                </select>
              </label>
              <button className="primary" style={{ marginTop: 10, width: '100%' }} onClick={() => void createRoom()}>
                Create room
              </button>
            </div>
            <div className="card">
              <h3>Join a room</h3>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && void joinRoom()}
                placeholder="Enter code"
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center' }}
              />
              <button className="primary" style={{ marginTop: 10, width: '100%' }} onClick={() => void joinRoom()}>
                Join
              </button>
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  // playing
  const captured = computeCaptured(fen);
  const myTurn = connected && !result && gameRef.current.turn() === myColor;
  const orientation = myColor === 'w' ? 'white' : 'black';
  const topSide: Color = myColor === 'w' ? 'b' : 'w';

  return (
    <div className="review">
      <div>
        <div
          className={`top-hint ${myTurn ? '' : 'muted'}`}
          style={{ opacity: 1 }}
        >
          {result ? result : myTurn ? 'Your move.' : connected ? "Opponent's move…" : status || 'Disconnected.'}
        </div>
        <div className="board-col" ref={boardCol}>
          <div className="board-stack">
            <div className="player-bar" style={{ width: boardWidth }}>
              <span className="player-name">Opponent</span>
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
                boardOrientation={orientation}
                onPieceDrop={onDrop}
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
        <div className="card">
          <h3>Online game</h3>
          <p className="note" style={{ marginTop: 0 }}>
            {connected ? 'Connected to your opponent.' : status || 'Disconnected.'}
          </p>
          <div className="play-buttons">
            <button onClick={resign} disabled={!connected || result !== null}>🏳 Resign</button>
            <button onClick={() => resetGame(myColor === 'w' ? 'b' : 'w', true)} disabled={!connected}>
              ↻ Rematch
            </button>
            <button onClick={leave} style={{ gridColumn: '1 / -1' }}>← Leave</button>
          </div>
        </div>

        {historySan.length > 0 && (
          <div className="card">
            <h3>Moves</h3>
            <div className="play-moves">{historySan.join(' ')}</div>
          </div>
        )}
      </div>

      {result && !resultDismissed && (
        <div className="modal-overlay" onClick={() => setResultDismissed(true)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{/win/i.test(result) && result.includes('🎉') ? '🎉 You win!' : 'Game over'}</div>
            <p className="modal-result">{result}</p>
            <div className="modal-actions">
              <button className="primary" onClick={() => resetGame(myColor === 'w' ? 'b' : 'w', true)}>
                ↻ Rematch
              </button>
              <button onClick={leave}>← Leave</button>
              <button onClick={() => setResultDismissed(true)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
