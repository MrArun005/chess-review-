import { useState } from 'react';
import { Chess } from 'chess.js';
import {
  fetchChessComGames,
  fetchLichessGames,
  fetchGameByUrl,
  splitPgns,
  summarize,
  type GameSummary,
} from '../review/import';

interface Props {
  onPgn: (pgn: string) => void;
  /** Open the free analysis board on a given FEN. */
  onFen?: (fen: string) => void;
}

const SAMPLE_PGN = `[Event "Sample"]
[White "Player"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0`;

export function Intake({ onPgn, onFen }: Props) {
  const [tab, setTab] = useState<'paste' | 'import' | 'fen'>('paste');
  const [pgn, setPgn] = useState('');
  const [site, setSite] = useState<'chess.com' | 'lichess'>('chess.com');
  const [username, setUsername] = useState('');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [pastedGames, setPastedGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fen, setFen] = useState('');
  const [fenError, setFenError] = useState<string | null>(null);

  const openFen = () => {
    const f = fen.trim();
    if (!f) return;
    try {
      // Validate — new Chess(fen) throws on an illegal position.
      const c = new Chess(f);
      onFen?.(c.fen());
      setFenError(null);
    } catch (e) {
      setFenError(e instanceof Error ? e.message : 'Not a valid FEN.');
    }
  };

  const reviewPasted = async () => {
    const text = pgn.trim();
    // A pasted game link: fetch its PGN first.
    if (/^https?:\/\//i.test(text)) {
      setLoading(true);
      setError(null);
      try {
        onPgn(await fetchGameByUrl(text));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load that link.');
      } finally {
        setLoading(false);
      }
      return;
    }
    // A paste can contain several games — split and let the user pick.
    const list = splitPgns(pgn);
    if (list.length > 1) {
      setPastedGames(list.map((g) => summarize(g, 'pgn')));
    } else {
      onPgn(pgn);
    }
  };

  const loadGames = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setGames([]);
    try {
      const list =
        site === 'chess.com'
          ? await fetchChessComGames(username)
          : await fetchLichessGames(username);
      setGames(list);
      if (list.length === 0) setError('No recent games found.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load games.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="intake">
      <div className="tabs">
        <button
          className={tab === 'paste' ? 'active' : ''}
          onClick={() => setTab('paste')}
        >
          Paste PGN
        </button>
        <button
          className={tab === 'import' ? 'active' : ''}
          onClick={() => setTab('import')}
        >
          Import by username
        </button>
        {onFen && (
          <button
            className={tab === 'fen' ? 'active' : ''}
            onClick={() => setTab('fen')}
          >
            Analyze a position
          </button>
        )}
      </div>

      {tab === 'paste' && (
        <>
          <textarea
            value={pgn}
            onChange={(e) => {
              setPgn(e.target.value);
              setPastedGames([]);
            }}
            placeholder="Paste a PGN — or a lichess game link (lichess.org/…)"
            spellCheck={false}
          />
          <div className="row">
            <button className="primary" disabled={!pgn.trim() || loading} onClick={reviewPasted}>
              {loading ? 'Loading…' : 'Review game'}
            </button>
            <button onClick={() => setPgn(SAMPLE_PGN)}>Load a sample</button>
          </div>
          {pastedGames.length > 1 && (
            <>
              <p className="note">
                {pastedGames.length} games found in this paste — pick one:
              </p>
              <div className="games">
                {pastedGames.map((g, i) => (
                  <button className="game-card" key={i} onClick={() => onPgn(g.pgn)}>
                    <span>
                      {g.white} vs {g.black}
                    </span>
                    <small>
                      {g.result} {g.date || ''}
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'import' && (
        <>
          <div className="row">
            <select
              value={site}
              onChange={(e) => setSite(e.target.value as 'chess.com' | 'lichess')}
              style={{ padding: 8 }}
            >
              <option value="chess.com">chess.com</option>
              <option value="lichess">lichess</option>
            </select>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadGames()}
              placeholder="username"
            />
            <button className="primary" onClick={loadGames} disabled={loading}>
              {loading ? 'Loading…' : 'Fetch games'}
            </button>
          </div>

          {games.length > 0 && (
            <div className="games">
              {games.map((g, i) => (
                <button className="game-card" key={i} onClick={() => onPgn(g.pgn)}>
                  <span>
                    {g.white} ({g.whiteRating || '?'}) vs {g.black} ({g.blackRating || '?'})
                  </span>
                  <small>
                    {g.result} · {g.timeClass || ''} {g.date || ''}
                  </small>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'fen' && onFen && (
        <>
          <textarea
            value={fen}
            onChange={(e) => {
              setFen(e.target.value);
              setFenError(null);
            }}
            placeholder="Paste a FEN, e.g. r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
            spellCheck={false}
            style={{ minHeight: 64 }}
          />
          <div className="row">
            <button className="primary" disabled={!fen.trim()} onClick={openFen}>
              Analyze position
            </button>
            <button
              onClick={() =>
                setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
              }
            >
              Starting position
            </button>
          </div>
          {fenError && <div className="error">{fenError}</div>}
          <p className="note">
            Set up any position and explore it with the engine — drag pieces,
            see the eval bar, best move, and top engine lines.
          </p>
        </>
      )}

      {error && <div className="error">{error}</div>}
      <p className="note">
        Everything runs in your browser — no login, no limits, nothing leaves
        your machine. First analysis of a game takes a bit; re-reviews are
        instant (cached).
      </p>
    </div>
  );
}
