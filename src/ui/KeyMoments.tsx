import { useMemo } from 'react';
import { ClassIcon } from './ClassIcon';
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
    <div className="section">
      <div className="section-title">Key moments</div>
      {top.map((m) => (
        <div className="moment" key={m.ply} onClick={() => onSelect(m.ply)}>
          <ClassIcon cls={m.classification} size={15} />
          <span className="moment-san">
            {m.moveNumber}
            {m.color === 'w' ? '.' : '...'} {m.san}
          </span>
          <span className="moment-who">{m.color === 'w' ? 'White' : 'Black'}</span>
          <span className="note">−{Math.round(m.drop)}%</span>
        </div>
      ))}
    </div>
  );
}
