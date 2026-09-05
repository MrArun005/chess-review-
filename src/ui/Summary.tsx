import { useMemo } from 'react';
import { gameAccuracy } from '../review/accuracy';
import { CLASS_LABEL, CLASS_COLOR, type MoveClass } from '../review/classify';
import { PHASE_LABEL, type Phase } from '../review/phase';
import type { ReviewedMove } from '../review/pipeline';

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

interface Props {
  moves: ReviewedMove[];
  openingName: string | null;
  eco?: string;
}

const COUNTED: MoveClass[] = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'book', 'inaccuracy', 'mistake', 'blunder', 'miss',
];

export function Summary({ moves, openingName, eco }: Props) {
  const stats = useMemo(() => computeStats(moves), [moves]);

  return (
    <div className="card summary">
      <h3>Summary</h3>
      {(openingName || eco) && (
        <p className="note" style={{ marginTop: -4 }}>
          {eco && <strong style={{ color: 'var(--muted)' }}>{eco} </strong>}
          {openingName ?? 'Opening'}
        </p>
      )}
      <div className="acc">
        <AccBox label="White accuracy" acc={stats.whiteAccuracy} />
        <AccBox label="Black accuracy" acc={stats.blackAccuracy} />
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

      <div className="phases">
        <div className="phase-head">
          <span>Phase</span>
          <span>White</span>
          <span>Black</span>
        </div>
        {PHASES.map((p) =>
          stats.phase[p].hasAny ? (
            <div className="phase-row" key={p}>
              <span>{PHASE_LABEL[p]}</span>
              <span>{stats.phase[p].white ?? '—'}</span>
              <span>{stats.phase[p].black ?? '—'}</span>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

function accColor(acc: number): string {
  if (acc >= 90) return '#81b64c';
  if (acc >= 80) return '#95a75c';
  if (acc >= 70) return '#f7c631';
  if (acc >= 55) return '#ffa459';
  return '#fa412d';
}

function AccBox({ label, acc }: { label: string; acc: number }) {
  const color = accColor(acc);
  return (
    <div className="box">
      <div className="big" style={{ color }}>
        {acc}
      </div>
      <small>{label}</small>
      <div className="barwrap">
        <div style={{ width: `${acc}%`, background: color }} />
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
  const whiteMoves = moves.filter((m) => m.color === 'w');
  const blackMoves = moves.filter((m) => m.color === 'b');

  const phase = {} as Record<
    Phase,
    { white: number | null; black: number | null; hasAny: boolean }
  >;
  for (const p of PHASES) {
    const w = phaseAccuracy(whiteMoves, p);
    const b = phaseAccuracy(blackMoves, p);
    phase[p] = { white: w, black: b, hasAny: w !== null || b !== null };
  }

  return {
    white: countBy(whiteMoves),
    black: countBy(blackMoves),
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
    phase,
  };
}

function phaseAccuracy(moves: ReviewedMove[], p: Phase): number | null {
  const inPhase = moves.filter((m) => m.phase === p);
  if (inPhase.length === 0) return null;
  return Math.round(
    gameAccuracy(
      inPhase.map((m) => m.accuracy),
      inPhase.map((m) => m.winMoverBefore)
    )
  );
}

function countBy(moves: ReviewedMove[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moves) out[m.classification] = (out[m.classification] ?? 0) + 1;
  return out;
}
