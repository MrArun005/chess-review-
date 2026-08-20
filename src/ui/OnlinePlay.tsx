import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import type { MqttClient } from 'mqtt';
import { Board } from './Board';
import { CapturedTray, computeCaptured } from './Captured';
import { sound } from './sound';
import { copyText } from './exportImage';

/**
 * Live play with a friend. You share a room code ONCE; after that every move
 * syncs automatically. Moves are relayed through a free public MQTT broker —
 * a small always-on server that just forwards messages — so there's no
 * device-to-device (P2P) connection to fail across mobile/firewall networks,
 * and no account or setup. mqtt is dynamically imported to keep it out of the
 * offline bundle.
 */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOPIC = (code: string) => `crchess/v1/${code}`;

/** Public broker (WebSocket). Overridable via ?mqtt= for self-host / testing. */
function brokerUrl(): string {
  try {
    const q = new URLSearchParams(location.search).get('mqtt');
    if (q) return q;
  } catch {
    /* ignore */
  }
  return 'wss://broker.emqx.io:8084/mqtt';
}

type Color = 'w' | 'b';
type Phase = 'menu' | 'connecting' | 'waiting' | 'playing';

interface Msg {
  t: 'hello' | 'start' | 'move' | 'resign' | 'rematch';
  by: string;
  role?: 'host' | 'guest';
  color?: Color; // guest's colour, on 'start'
  fen?: string;
  uci?: string;
}

function makeCode(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
const clientId = () => 'c' + Math.random().toString(36).slice(2, 10);

export function OnlinePlay() {
  const gameRef = useRef(new Chess());
  const clientRef = useRef<MqttClient | null>(null);
  const idRef = useRef(clientId());
  const codeRef = useRef(''); // room code — a ref so message handlers never see a stale value
  const roleRef = useRef<'host' | 'guest'>('host');
  const hostColorRef = useRef<Color>('w');
  const myColorRef = useRef<Color>('w');
  const oppRef = useRef(false); // opponent present?
  const watchdogRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>('menu');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [hostColor, setHostColor] = useState<'w' | 'b' | 'random'>('w');
  const [myColor, setMyColor] = useState<Color>('w');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fen, setFen] = useState(START_FEN);
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [boardWidth, setBoardWidth] = useState(440);
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

  useEffect(() => () => teardown(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    const g = gameRef.current;
    setFen(g.fen());
    setHistorySan(g.history());
    const v = g.history({ verbose: true });
    const last = v[v.length - 1];
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setResult(gameResult(g));
  }, []);

  const publish = (m: Omit<Msg, 'by'>) => {
    clientRef.current?.publish(TOPIC(codeRef.current), JSON.stringify({ ...m, by: idRef.current }));
  };

  const onMessage = useCallback(
    (raw: string) => {
      let m: Msg;
      try {
        m = JSON.parse(raw) as Msg;
      } catch {
        return;
      }
      if (m.by === idRef.current) return; // ignore our own

      if (m.t === 'hello') {
        // Host greets an arriving guest with the game's colour + current state.
        if (roleRef.current === 'host' && m.role === 'guest') {
          const guestColor: Color = hostColorRef.current === 'w' ? 'b' : 'w';
          clientRef.current?.publish(
            TOPIC(codeRef.current),
            JSON.stringify({ t: 'start', by: idRef.current, color: guestColor, fen: gameRef.current.fen() } as Msg)
          );
          markConnected();
        }
        return;
      }
      if (m.t === 'start') {
        // Guest learns its colour and syncs to the host's position.
        if (roleRef.current === 'guest') {
          if (m.color) {
            setMyColor(m.color);
            myColorRef.current = m.color;
          }
          if (m.fen) {
            try {
              gameRef.current.load(m.fen);
            } catch {
              /* ignore */
            }
          }
          markConnected();
          refresh();
        }
        return;
      }
      if (m.t === 'move' && m.uci) {
        const g = gameRef.current;
        try {
          const mv = g.move({
            from: m.uci.slice(0, 2),
            to: m.uci.slice(2, 4),
            promotion: (m.uci[4] as never) || 'q',
          });
          if (mv) {
            sound.forSan(mv.san);
            setLastMove({ from: mv.from, to: mv.to });
          } else if (m.fen) {
            g.load(m.fen);
          }
        } catch {
          if (m.fen) g.load(m.fen);
        }
        refresh();
        return;
      }
      if (m.t === 'resign') {
        setResult('Opponent resigned — you win! 🎉');
        return;
      }
      if (m.t === 'rematch') {
        doReset(myColorRef.current === 'w' ? 'b' : 'w');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh]
  );

  const markConnected = () => {
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    oppRef.current = true;
    setPhase('playing');
    setStatus('');
    setError(null);
  };

  const connect = (asHost: boolean, roomCode: string, onReady?: () => void) => {
    setError(null);
    setPhase('connecting');
    setStatus('Connecting…');
    roleRef.current = asHost ? 'host' : 'guest';
    void import('mqtt').then((mod) => {
      const mqttConnect = (mod as unknown as { connect?: typeof import('mqtt').connect; default?: { connect: typeof import('mqtt').connect } }).connect
        ?? (mod as unknown as { default: { connect: typeof import('mqtt').connect } }).default.connect;
      const client = mqttConnect(brokerUrl(), {
        clientId: idRef.current + Math.random().toString(36).slice(2, 6),
        clean: true,
        reconnectPeriod: 3000,
        connectTimeout: 8000,
      });
      clientRef.current = client;

      // If we can't reach the broker at all, say so.
      if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
      watchdogRef.current = window.setTimeout(() => {
        if (phaseRef.current === 'connecting') {
          setError("Couldn't reach the game server. Check your connection and try again.");
          setStatus('');
          setPhase('menu');
          client.end(true);
        }
      }, 12000);

      client.on('connect', () => {
        client.subscribe(TOPIC(roomCode), () => {
          onReady?.();
          // Announce ourselves so the other side connects us.
          client.publish(TOPIC(roomCode), JSON.stringify({ t: 'hello', by: idRef.current, role: roleRef.current } as Msg));
        });
      });
      client.on('message', (_topic, payload) => onMessage(payload.toString()));
      client.on('error', () => setStatus('Connection trouble — reconnecting…'));
    });
  };

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const createRoom = () => {
    const c = makeCode();
    codeRef.current = c;
    setCode(c);
    const hc: Color = hostColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : hostColor;
    hostColorRef.current = hc;
    setMyColor(hc);
    myColorRef.current = hc;
    doReset(hc);
    connect(true, c, () => {
      if (!oppRef.current) {
        setPhase('waiting');
        setStatus('Waiting for your friend to join…');
      }
    });
  };

  const joinRoom = () => {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 3) return;
    codeRef.current = c;
    setCode(c);
    roleRef.current = 'guest';
    connect(false, c);
  };

  const doReset = (mine: Color) => {
    gameRef.current = new Chess();
    setMyColor(mine);
    myColorRef.current = mine;
    setResult(null);
    setResultDismissed(false);
    refresh();
  };

  function teardown() {
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    clientRef.current?.end(true);
    clientRef.current = null;
    oppRef.current = false;
  }

  const leave = () => {
    teardown();
    setPhase('menu');
    setStatus('');
    setError(null);
    setCode('');
    codeRef.current = '';
    gameRef.current = new Chess();
    refresh();
  };

  const onDrop = (from: string, to: string, promotion?: string): boolean => {
    const g = gameRef.current;
    if (phase !== 'playing' || result) return false;
    if (g.turn() !== myColorRef.current) return false;
    let mv: Move | null = null;
    try {
      mv = g.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!mv) return false;
    sound.forSan(mv.san);
    setLastMove({ from: mv.from, to: mv.to });
    publish({ t: 'move', uci: mv.from + mv.to + (mv.promotion ?? ''), fen: g.fen() });
    refresh();
    return true;
  };

  const resign = () => {
    if (phase !== 'playing' || result) return;
    publish({ t: 'resign' });
    setResult('You resigned — opponent wins.');
  };

  const rematch = () => {
    const mine: Color = myColor === 'w' ? 'b' : 'w';
    publish({ t: 'rematch' });
    doReset(mine);
  };

  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const captured = useMemo(() => computeCaptured(fen), [fen]);
  const topSide: Color = myColor === 'w' ? 'b' : 'w';
  const myTurn = phase === 'playing' && !result && gameRef.current.turn() === myColor;

  // ----- menu / connecting / waiting -----
  if (phase === 'menu' || phase === 'connecting' || phase === 'waiting') {
    return (
      <div className="intake">
        <h2 style={{ margin: 0 }}>Play a friend</h2>
        <p className="note" style={{ marginTop: 0 }}>
          Share a room code once — then every move updates live on both devices. No account, works
          on any network.
        </p>

        {phase === 'waiting' ? (
          <div className="card">
            <h3>Your room code</h3>
            <div className="room-code">{code}</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button onClick={copy}>{copied ? '✓ Copied' : '📋 Copy code'}</button>
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
              <button className="primary" style={{ marginTop: 10, width: '100%' }} onClick={createRoom}>
                Create room
              </button>
            </div>
            <div className="card">
              <h3>Join a room</h3>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                placeholder="Enter code"
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center' }}
              />
              <button className="primary" style={{ marginTop: 10, width: '100%' }} onClick={joinRoom}>
                Join
              </button>
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  // ----- playing -----
  return (
    <div className="review">
      <div>
        <div className={`top-hint ${myTurn ? '' : 'muted'}`}>
          {result ? result : myTurn ? `Your move — you're ${myColor === 'w' ? 'White' : 'Black'}.` : "Opponent's move…"}
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
                boardOrientation={myColor === 'w' ? 'white' : 'black'}
                onPieceDrop={myTurn ? onDrop : undefined}
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
          <h3>Live game · room {code}</h3>
          <p className="note" style={{ marginTop: 0 }}>Connected — moves sync automatically.</p>
          <div className="play-buttons">
            <button onClick={resign} disabled={result !== null}>🏳 Resign</button>
            <button onClick={rematch}>↻ Rematch</button>
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
              <button className="primary" onClick={rematch}>↻ Rematch</button>
              <button onClick={leave}>← Leave</button>
              <button onClick={() => setResultDismissed(true)}>Close</button>
            </div>
          </div>
        </div>
      )}
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
