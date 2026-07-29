import { useMemo } from 'react';
import { gameAccuracy } from '../review/accuracy';
import { CLASS_LABEL, CLASS_COLOR, type MoveClass } from '../review/classify';
import type { ReviewedMove } from '../review/pipeline';

interface Props {
  moves: ReviewedMove[];
  openingName: string | null;
}

const COUNTED: MoveClass[] = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'book', 'inaccuracy', 'mistake', 'blunder', 'miss',
];

export function Summary({ moves, openingName }: Props) {
  const stats = useMemo(() => computeStats(moves), [moves]);

  return (
    <div className="card summary">
      <h3>Summary</h3>
      {openingName && (
        <p className="note" style={{ marginTop: -4 }}>
          Opening: {openingName}
        </p>
      )}
      <div className="acc">
        <div>
          <div className="big">{stats.whiteAccuracy}</div>
          <small>White accuracy</small>
        </div>
        <div>
          <div className="big">{stats.blackAccuracy}</div>
          <small>Black accuracy</small>
        </div>
      </div>

      <div className="counts">
        <div>
          <strong>White</strong>
          {renderCounts(stats.white)}
        </div>
        <div>
          <strong>Black</strong>
          {renderCounts(stats.black)}
        </div>
      </div>
    </div>
  );
}

function renderCounts(counts: Record<string, number>) {
  return COUNTED.filter((c) => counts[c]).map((c) => (
    <div className="k" key={c}>
      <span style={{ color: CLASS_COLOR[c] }}>{CLASS_LABEL[c]}</span>
      <span>{counts[c]}</span>
    </div>
  ));
}

function computeStats(moves: ReviewedMove[]) {
  const white = countBy(moves.filter((m) => m.color === 'w'));
  const black = countBy(moves.filter((m) => m.color === 'b'));

  const whiteMoves = moves.filter((m) => m.color === 'w');
  const blackMoves = moves.filter((m) => m.color === 'b');

  return {
    white,
    black,
    whiteAccuracy: Math.round(
      gameAccuracy(
        whiteMoves.map((m) => m.accuracy),
        whiteMoves.map((m) => m.winMoverBefore)
      )
    ),
    blackAccuracy: Math.round(
      gameAccuracy(
        blackMoves.map((m) => m.accuracy),
        blackMoves.map((m) => m.winMoverBefore)
      )
    ),
  };
}

function countBy(moves: ReviewedMove[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moves) out[m.classification] = (out[m.classification] ?? 0) + 1;
  return out;
}
