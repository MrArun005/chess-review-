import { useMemo } from 'react';
import { gameAccuracy } from '../review/accuracy';
import { CLASS_LABEL, CLASS_COLOR, type MoveClass } from '../review/classify';
import { PHASE_LABEL, type Phase } from '../review/phase';
import type { ReviewedMove } from '../review/pipeline';

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

interface Props {
  moves: ReviewedMove[];
  openingName: string | null;
}

const COUNTED: MoveClass[] = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'book', 'inaccuracy', 'mistake', 'blunder', 'miss',
];

export function Summary({ moves, openingName }: Props) {
  const stats = useMemo(() => computeStats(moves), [moves]);

  return (
    <div className="card summary">
      <h3>Summary</h3>
      {openingName && (
        <p className="note" style={{ marginTop: -4 }}>
          Opening: {openingName}
        </p>
      )}
      <div className="acc">
        <div>
          <div className="big">{stats.whiteAccuracy}</div>
          <small>White accuracy</small>
        </div>
        <div>
          <div className="big">{stats.blackAccuracy}</div>
          <small>Black accuracy</small>
        </div>
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
