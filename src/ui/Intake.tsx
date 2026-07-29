import { useState } from 'react';
import {
  fetchChessComGames,
  fetchLichessGames,
  type GameSummary,
} from '../review/import';

interface Props {
  onPgn: (pgn: string) => void;
}

const SAMPLE_PGN = `[Event "Sample"]
[White "Player"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0`;

export function Intake({ onPgn }: Props) {
  const [tab, setTab] = useState<'paste' | 'import'>('paste');
  const [pgn, setPgn] = useState('');
  const [site, setSite] = useState<'chess.com' | 'lichess'>('chess.com');
  const [username, setUsername] = useState('');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      </div>

      {tab === 'paste' && (
        <>
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Paste a PGN here…"
            spellCheck={false}
          />
          <div className="row">
            <button
              className="primary"
              disabled={!pgn.trim()}
              onClick={() => onPgn(pgn)}
            >
              Review game
            </button>
            <button onClick={() => setPgn(SAMPLE_PGN)}>Load a sample</button>
          </div>
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

      {error && <div className="error">{error}</div>}
      <p className="note">
        Everything runs in your browser — no login, no limits, nothing leaves
        your machine. First analysis of a game takes a bit; re-reviews are
        instant (cached).
      </p>
    </div>
  );
}
