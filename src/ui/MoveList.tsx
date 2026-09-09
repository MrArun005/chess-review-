import { useEffect, useRef } from 'react';
import { ClassIcon } from './ClassIcon';
import type { ReviewedMove } from '../review/pipeline';

interface Props {
  moves: ReviewedMove[];
  current: number; // ply index, -1 = start
  onSelect: (ply: number) => void;
}

/** Dense two-column move list with classification markers; keeps the current move in view. */
export function MoveList({ moves, current, onSelect }: Props) {
  const rows: { num: number; white?: ReviewedMove; black?: ReviewedMove }[] = [];
  for (const m of moves) {
    const last = rows[rows.length - 1];
    if (m.color === 'w' || !last || last.black) {
      rows.push({ num: m.moveNumber, white: m.color === 'w' ? m : undefined, black: m.color === 'b' ? m : undefined });
    } else {
      last.black = m;
    }
  }

  const activeRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Keep the current move visible by scrolling the LIST only — scrollIntoView
  // would also scroll the page and yank the board out of view.
  useEffect(() => {
    const el = activeRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 2 + el.offsetHeight / 2);
    }
  }, [current]);

  const cell = (m?: ReviewedMove) => {
    if (!m) return <span className="cell" />;
    const active = current === m.ply;
    return (
      <span
        className={`cell ${active ? 'active' : ''}`}
        onClick={() => onSelect(m.ply)}
        ref={active ? activeRef : undefined}
      >
        <ClassIcon cls={m.classification} size={15} />
        <span className="san">{m.san}</span>
      </span>
    );
  };

  return (
    <div className="movelist" ref={listRef}>
      {rows.map((r, i) => (
        <div className={`mrow ${i % 2 ? 'odd' : ''}`} key={i}>
          <div className="num">{r.num}.</div>
          {cell(r.white)}
          {cell(r.black)}
        </div>
      ))}
    </div>
  );
}
