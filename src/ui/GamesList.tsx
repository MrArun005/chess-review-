import { useEffect, useState } from 'react';
import { listGames, deleteGame, type SavedGameMeta } from '../review/history';

interface Props {
  /** Open a saved game instantly (no re-analysis). */
  onOpen: (id: string) => void;
  /** Bumps when a new game is saved, to trigger a refresh. */
  refreshKey?: number;
}

/** "My Games" — locally saved reviews, reopenable instantly. */
export function GamesList({ onOpen, refreshKey }: Props) {
  const [games, setGames] = useState<SavedGameMeta[]>([]);

  useEffect(() => {
    let alive = true;
    void listGames().then((g) => {
      if (alive) setGames(g);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (games.length === 0) return null;

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteGame(id);
    setGames((g) => g.filter((x) => x.id !== id));
  };

  return (
    <div className="card games-history">
      <h3>My games</h3>
      <div className="games-list">
        {games.map((g) => (
          <button key={g.id} className="game-row" onClick={() => onOpen(g.id)}>
            <span className="game-row-main">
              <span className="game-row-players">
                {g.white} <span className="vs">vs</span> {g.black}
              </span>
              <span className="game-row-sub">
                {g.opening ?? 'Game'} · {g.result} · {g.moveCount} moves
                {g.date ? ` · ${g.date}` : ''}
              </span>
            </span>
            <span className="game-row-acc">
              <span className="acc-w" title="White accuracy">{g.whiteAcc}</span>
              <span className="acc-sep">/</span>
              <span className="acc-b" title="Black accuracy">{g.blackAcc}</span>
            </span>
            <span className="game-row-del" title="Delete" onClick={(e) => void remove(g.id, e)}>
              ✕
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
