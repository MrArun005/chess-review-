import { CLASS_LABEL, CLASS_COLOR } from '../review/classify';
import type { ReviewedMove } from '../review/pipeline';

interface Props {
  move: ReviewedMove | null;
}

/** The per-move panel: badge, eval before/after, best line, explanation. */
export function MoveDetail({ move }: Props) {
  if (!move) {
    return (
      <div className="card detail">
        <h3>Move detail</h3>
        <p className="note">Select a move to see its analysis.</p>
      </div>
    );
  }

  const cls = move.classification;
  return (
    <div className="card detail">
      <h3>Move detail</h3>
      <div className="headline">
        <span className="badge" style={{ background: CLASS_COLOR[cls] }}>
          {CLASS_LABEL[cls]}
        </span>
        <strong>
          {move.moveNumber}
          {move.color === 'w' ? '.' : '...'} {move.san}
        </strong>
      </div>

      <div className="evals">
        Win chance {Math.round(move.winMoverBefore)}% →{' '}
        {Math.round(move.winMoverAfter)}%
        {move.drop > 1 && ` (−${Math.round(move.drop)}%)`} · accuracy{' '}
        {Math.round(move.accuracy)}
      </div>

      {move.bestSan && move.bestSan !== move.san && (
        <div className="best">
          Best: {move.bestLineSan.length ? move.bestLineSan.join(' ') : move.bestSan}
        </div>
      )}

      {move.explanations.length > 0 ? (
        move.explanations.map((e) => (
          <div className="explanation" key={e.ruleId}>
            {e.text}
          </div>
        ))
      ) : (
        <p className="note">
          {move.bestSan === move.san
            ? 'The engine agrees — this is the top move.'
            : 'A reasonable move.'}
        </p>
      )}
    </div>
  );
}
