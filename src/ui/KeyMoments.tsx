import { useMemo } from 'react';
import { CLASS_LABEL, CLASS_COLOR } from '../review/classify';
import type { ReviewedMove } from '../review/pipeline';

interface Props {
  moves: ReviewedMove[];
  onSelect: (ply: number) => void;
}

/** The five moves that swung the game most (by win% drop). */
export function KeyMoments({ moves, onSelect }: Props) {
  const top = useMemo(
    () =>
      moves
        .filter((m) => m.drop > 3)
        .sort((a, b) => b.drop - a.drop)
        .slice(0, 5),
    [moves]
  );

  if (top.length === 0) return null;

  return (
    <div className="card">
      <h3>Key moments</h3>
      {top.map((m) => (
        <div className="moment" key={m.ply} onClick={() => onSelect(m.ply)}>
          <span>
            {m.moveNumber}
            {m.color === 'w' ? '.' : '...'} {m.san}{' '}
            <span style={{ color: CLASS_COLOR[m.classification] }}>
              {CLASS_LABEL[m.classification]}
            </span>
          </span>
          <span className="note">−{Math.round(m.drop)}%</span>
        </div>
      ))}
    </div>
  );
}
