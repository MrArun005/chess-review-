import { useMemo } from 'react';
import { gameAccuracy } from '../review/accuracy';
import { CLASS_LABEL, type MoveClass } from '../review/classify';
import { PHASE_LABEL, type Phase } from '../review/phase';
import type { ReviewedMove } from '../review/pipeline';
import { ClassIcon } from './ClassIcon';

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

interface Props {
  moves: ReviewedMove[];
  openingName: string | null;
  eco?: string;
  whiteName?: string;
  blackName?: string;
}

const COUNTED: MoveClass[] = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'book', 'inaccuracy', 'mistake', 'blunder', 'miss',
];

/** Accuracy for both sides plus the classification table, chess.com style. */
export function Summary({ moves, whiteName = 'White', blackName = 'Black' }: Props) {
  const stats = useMemo(() => computeStats(moves), [moves]);

  return (
    <div className="section summary">
      <div className="acc-head">
        <span className="pname">{whiteName}</span>
        <span className="section-title" style={{ margin: 0 }}>Accuracy</span>
        <span className="pname right">{blackName}</span>
      </div>
      <div className="acc">
        <AccBox acc={stats.whiteAccuracy} side="w" />
        <AccBox acc={stats.blackAccuracy} side="b" />
      </div>

      <div className="counts">
        {COUNTED.filter((c) => stats.white[c] || stats.black[c]).map((c) => (
          <div className="crow" key={c}>
            <span className="cnum">{stats.white[c] ?? 0}</span>
            <span className="clabel">
              <ClassIcon cls={c} size={16} />
              {CLASS_LABEL[c]}
            </span>
            <span className="cnum">{stats.black[c] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="phases">
        {PHASES.map((p) =>
          stats.phase[p].hasAny ? (
            <div className="phase-row" key={p}>
              <span>{stats.phase[p].white ?? '—'}</span>
              <span className="plabel">{PHASE_LABEL[p]}</span>
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

function AccBox({ acc, side }: { acc: number; side: 'w' | 'b' }) {
  return (
    <div className={`box ${side}`}>
      <div className="big" style={{ color: side === 'w' ? '#262421' : accColor(acc) }}>
        {acc}
      </div>
      <div className="barwrap">
        <div style={{ width: `${acc}%`, background: accColor(acc) }} />
      </div>
    </div>
  );
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
