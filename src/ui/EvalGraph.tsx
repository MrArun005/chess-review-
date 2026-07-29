import { CLASS_COLOR, type MoveClass } from '../review/classify';

interface Props {
  /** White win% at each boundary (length = plies + 1). */
  series: number[];
  /** Per-ply classification for marking blunders (length = plies). */
  classes?: MoveClass[];
  current: number; // current ply index
  onSeek: (ply: number) => void;
  width?: number;
  height?: number;
}

/**
 * Win% over the game. Filled area above/below the 50% line, blunder/mistake
 * markers, and a click-to-seek surface.
 */
export function EvalGraph({
  series,
  classes = [],
  current,
  onSeek,
  width = 336,
  height = 84,
}: Props) {
  if (series.length < 2) return null;
  const n = series.length;
  const x = (i: number) => (i / (n - 1)) * width;
  const y = (v: number) => height - (v / 100) * height;

  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  const markers = classes
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c === 'blunder' || c === 'mistake' || c === 'miss');

  const seekFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(Math.round(frac * (n - 1)));
  };

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      onClick={seekFromEvent}
      style={{ cursor: 'pointer', display: 'block' }}
    >
      <rect x={0} y={0} width={width} height={height / 2} fill="#00000022" />
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#ffffff22" />
      <path d={area} fill="#ffffff18" />
      <path d={line} fill="none" stroke="#e9e6df" strokeWidth={1.5} />
      {markers.map(({ c, i }) => (
        <circle key={i} cx={x(i + 1)} cy={y(series[i + 1] ?? 50)} r={3} fill={CLASS_COLOR[c]} />
      ))}
      <line
        x1={x(current)}
        y1={0}
        x2={x(current)}
        y2={height}
        stroke="#e5c14c"
        strokeWidth={1.5}
      />
    </svg>
  );
}
