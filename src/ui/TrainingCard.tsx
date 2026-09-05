import { useEffect, useState } from 'react';
import { deckStats, type DeckStats } from '../review/deck';
import { listGames, type SavedGameMeta } from '../review/history';

interface Props {
  onStart: () => void;
  refreshKey?: number;
}

/** Daily training + progress: spaced-repetition due count and a recent-accuracy trend. */
export function TrainingCard({ onStart, refreshKey }: Props) {
  const [stats, setStats] = useState<DeckStats>({ total: 0, due: 0, mastered: 0 });
  const [games, setGames] = useState<SavedGameMeta[]>([]);

  useEffect(() => {
    setStats(deckStats());
    let alive = true;
    void listGames().then((g) => {
      if (alive) setGames(g);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (stats.total === 0) return null;

  // Oldest → newest, last 14, for the sparkline.
  const recent = games.slice(0, 14).reverse();

  return (
    <div className="card training-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Daily training</h3>
        {stats.due > 0 ? (
          <button className="primary" onClick={onStart}>
            Train {stats.due} due
          </button>
        ) : (
          <span className="note">✓ All caught up</span>
        )}
      </div>

      <div className="train-stats">
        <div><b>{stats.due}</b><span>due</span></div>
        <div><b>{stats.total}</b><span>in deck</span></div>
        <div><b>{stats.mastered}</b><span>mastered</span></div>
      </div>

      {recent.length >= 2 && (
        <div className="train-trend">
          <div className="h3" style={{ marginBottom: 6 }}>Recent accuracy</div>
          <Sparkline games={recent} />
          <div className="train-legend">
            <span><i style={{ background: '#81b64c' }} /> White</span>
            <span><i style={{ background: '#ffa459' }} /> Black</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkline({ games }: { games: SavedGameMeta[] }) {
  const W = 320;
  const H = 60;
  const n = games.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (acc: number) => H - (Math.max(0, Math.min(100, acc)) / 100) * H;
  const line = (key: 'whiteAcc' | 'blackAcc') =>
    games.map((g, i) => `${x(i).toFixed(1)},${y(g[key]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 60, display: 'block' }}>
      <line x1="0" y1={y(50)} x2={W} y2={y(50)} stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="3 3" />
      <polyline points={line('whiteAcc')} fill="none" stroke="#81b64c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={line('blackAcc')} fill="none" stroke="#ffa459" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
