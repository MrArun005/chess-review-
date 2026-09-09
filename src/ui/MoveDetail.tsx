import { CLASS_LABEL, CLASS_COLOR } from '../review/classify';
import { ClassIcon } from './ClassIcon';
import type { ReviewedMove } from '../review/pipeline';

interface Props {
  move: ReviewedMove | null;
}

/** "is the Best move", "is a Great move", "is a Mistake", "is Forced" … */
function headlineVerb(cls: string, label: string): string {
  if (cls === 'best') return 'is the Best move';
  if (cls === 'forced') return 'is Forced';
  if (cls === 'book') return 'is a Book move';
  const nouns = new Set(['inaccuracy', 'mistake', 'blunder', 'miss']);
  const article = /^[aeiou]/i.test(label) ? 'an' : 'a';
  return nouns.has(cls) ? `is ${article} ${label}` : `is ${article} ${label} move`;
}

/** The coach headline: "Nf3 is a Mistake", why, and what was best. */
export function MoveDetail({ move }: Props) {
  if (!move) {
    return (
      <div className="section detail">
        <div className="headline">
          <span className="class-icon start">★</span>
          <div>
            <div className="head-title">Game start</div>
            <div className="head-sub">Step through the moves, or click one in the list.</div>
          </div>
        </div>
      </div>
    );
  }

  const cls = move.classification;
  const label = CLASS_LABEL[cls];
  const isBest = move.bestSan === move.san;
  const verb = headlineVerb(cls, label);

  return (
    <div className="section detail">
      <div className="headline">
        <ClassIcon cls={cls} size={34} />
        <div style={{ minWidth: 0 }}>
          <div className="head-title" style={{ color: CLASS_COLOR[cls] }}>
            {move.san} {verb}
          </div>
          <div className="head-sub">
            {move.moveNumber}
            {move.color === 'w' ? '.' : '...'} · win chance {Math.round(move.winMoverBefore)}% →{' '}
            {Math.round(move.winMoverAfter)}%
            {move.drop > 1 && ` (−${Math.round(move.drop)})`} · accuracy {Math.round(move.accuracy)}
          </div>
        </div>
      </div>

      {move.explanations.length > 0 ? (
        move.explanations.map((e) => (
          <p className="explanation" key={e.ruleId}>
            {e.text}
          </p>
        ))
      ) : (
        <p className="explanation muted">
          {isBest ? 'The engine agrees — this is the top move.' : 'A reasonable move.'}
        </p>
      )}

      {move.bestSan && !isBest && (
        <div className="bestline">
          <span className="bestlabel">
            <ClassIcon cls="best" size={15} /> Best was <b>{move.bestSan}</b>
          </span>
          {move.bestLineSan.length > 1 && (
            <span className="pv">{move.bestLineSan.slice(1).join(' ')}</span>
          )}
        </div>
      )}
    </div>
  );
}
