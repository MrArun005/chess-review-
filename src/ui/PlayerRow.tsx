import { CapturedTray, type CapturedInfo } from './Captured';

interface Props {
  name: string;
  elo?: string;
  color: 'w' | 'b';
  captured: CapturedInfo;
  /** Highlight this player as the side to move. */
  active?: boolean;
}

/** chess.com-style player strip: avatar, name, rating, captured pieces. */
export function PlayerRow({ name, elo, color, captured, active }: Props) {
  return (
    <div className={`player-row ${active ? 'active' : ''}`}>
      <span className={`avatar ${color}`} aria-hidden>
        {name.trim()[0]?.toUpperCase() ?? (color === 'w' ? 'W' : 'B')}
      </span>
      <span className="pname">
        {name}
        {elo && <span className="pelo">({elo})</span>}
      </span>
      <CapturedTray info={captured} side={color} />
    </div>
  );
}
