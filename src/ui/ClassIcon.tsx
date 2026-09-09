import { CLASS_ICON, CLASS_COLOR, CLASS_LABEL, type MoveClass } from '../review/classify';

/** The round classification marker used in the move list, headline and counts. */
export function ClassIcon({ cls, size = 18 }: { cls: MoveClass; size?: number }) {
  return (
    <span
      className="class-icon"
      title={CLASS_LABEL[cls]}
      style={{ background: CLASS_COLOR[cls], width: size, height: size, fontSize: Math.round(size * 0.62) }}
    >
      {CLASS_ICON[cls]}
    </span>
  );
}
