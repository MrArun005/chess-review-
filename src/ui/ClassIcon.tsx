import { CLASS_ICON, CLASS_COLOR, CLASS_LABEL, type MoveClass } from '../review/classify';

/**
 * The glyph inside a classification marker. Text for the punctuation grades
 * (!!, !, ?, ??, ?!, ★, ✓); crisp inline SVG where a text glyph would fall back
 * to an emoji or a font-dependent symbol (book, forced, miss).
 */
export function ClassGlyph({ cls }: { cls: MoveClass }) {
  if (cls === 'book') {
    return (
      <svg viewBox="0 0 24 24" width="62%" height="62%" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 5.5A2 2 0 0 1 6 4h4a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H6a2 2 0 0 1-2-2z" />
        <path d="M20 5.5A2 2 0 0 0 18 4h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4a2 2 0 0 0 2-2z" />
      </svg>
    );
  }
  if (cls === 'forced') {
    return (
      <svg viewBox="0 0 24 24" width="62%" height="62%" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h13M13 6l6 6-6 6" />
      </svg>
    );
  }
  if (cls === 'miss') {
    return (
      <svg viewBox="0 0 24 24" width="58%" height="58%" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  return <>{CLASS_ICON[cls]}</>;
}

/** The round classification marker used in the move list, headline and counts. */
export function ClassIcon({ cls, size = 18 }: { cls: MoveClass; size?: number }) {
  return (
    <span
      className="class-icon"
      title={CLASS_LABEL[cls]}
      style={{ background: CLASS_COLOR[cls], width: size, height: size, fontSize: Math.round(size * 0.62) }}
    >
      <ClassGlyph cls={cls} />
    </span>
  );
}
