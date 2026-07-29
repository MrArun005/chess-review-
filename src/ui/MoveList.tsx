import { CLASS_ICON, CLASS_COLOR } from '../review/classify';
import type { ReviewedMove } from '../review/pipeline';

interface Props {
  moves: ReviewedMove[];
  current: number; // ply index, -1 = start
  onSelect: (ply: number) => void;
}

/** Two-column SAN move list with per-move badge glyphs. */
export function MoveList({ moves, current, onSelect }: Props) {
  // Group plies into full moves.
  const rows: { num: number; white?: ReviewedMove; black?: ReviewedMove }[] = [];
  for (const m of moves) {
    const last = rows[rows.length - 1];
    if (m.color === 'w' || !last || last.black) {
      rows.push({ num: m.moveNumber, white: m.color === 'w' ? m : undefined, black: m.color === 'b' ? m : undefined });
    } else {
      last.black = m;
    }
  }

  const cell = (m?: ReviewedMove) => {
    if (!m) return <span className="cell" />;
    return (
      <span
        className={`cell ${current === m.ply ? 'active' : ''}`}
        onClick={() => onSelect(m.ply)}
      >
        <span>{m.san}</span>
        <span className="badge" style={{ color: CLASS_COLOR[m.classification] }}>
          {CLASS_ICON[m.classification]}
        </span>
      </span>
    );
  };

  return (
    <div className="movelist">
      {rows.map((r, i) => (
        <div style={{ display: 'contents' }} key={i}>
          <div className="num">{r.num}.</div>
          {cell(r.white)}
          {cell(r.black)}
        </div>
      ))}
    </div>
  );
}
