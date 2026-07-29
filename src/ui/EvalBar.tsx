interface Props {
  /** White win probability, 0-100. */
  winWhite: number;
}

/**
 * The eval bar is driven by WIN%, not centipawns. A cp-driven bar looks broken
 * because win% is non-linear in cp — a +3 and a +9 both look near-winning.
 */
export function EvalBar({ winWhite }: Props) {
  const pct = Math.max(0, Math.min(100, winWhite));
  const showTop = pct < 50;
  const label = pct >= 50 ? Math.round(pct) : Math.round(100 - pct);
  return (
    <div className="evalbar" title={`White win chance ${Math.round(pct)}%`}>
      <div className="white" style={{ height: `${pct}%` }} />
      <div className={`label ${showTop ? 'top' : ''}`}>{label}%</div>
    </div>
  );
}
