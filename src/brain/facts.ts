import { Chess } from 'chess.js';
import { boardMap, PIECE_VALUE, type Color } from './attacks';
import { detectAll, type MotifHit, type MotifName } from './motifs';
import { topFeatureDelta } from './features';
import type { PvLine } from '../engine/types';

const NAME: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/**
 * The deterministic fact layer consumed by the rule engine. Every field is a
 * boolean or number extracted from the board and the engine PV — nothing here
 * is generated, so nothing can be hallucinated.
 */
export interface Facts {
  mover: Color;
  sanPlayed: string;
  pieceMoved: string; // "knight", "pawn", ...
  fromSquare: string;
  toSquare: string;

  bestUci: string | null;
  bestSan: string | null;
  refutationUci: string | null;
  refutationSan: string | null;

  bestIsMate: boolean;
  playedIsMate: boolean; // the played move still forces mate for the mover
  mateIn: number | null;

  /** Material change for the mover after the refutation PV plays out. Negative = mover loses material. */
  materialSwing: number;
  refutationIsCapture: boolean;

  /** How much material (mover POV) the best move wins that the played move didn't — a missed win. 0 if none. */
  missedGain: number;

  /** Strongest motif the opponent gets, or null. */
  opponentMotif: MotifName | null;
  motifs: MotifHit[];
  hangingPiece: { piece: string; square: string } | null;
  targets: string[];

  /** Human phrase for the biggest positional change vs the best move. */
  topFeatureDelta: string;

  winBefore: number;
  winAfter: number;
  drop: number;
}

export interface FactInput {
  fenBefore: string;
  playedUci: string;
  fenAfter: string;
  bestLine: PvLine; // best from fenBefore, White POV
  afterLine: PvLine; // opponent's best reply from fenAfter, White POV
  winBefore: number; // mover POV
  winAfter: number; // mover POV
}

const VAL = PIECE_VALUE;

/** Total material for one color on the board. */
export function material(chess: Chess, color: Color): number {
  return chess
    .board()
    .flat()
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .filter((p) => p.color === color)
    .reduce((s, p) => s + VAL[p.type], 0);
}

/** Play a UCI PV onto a fresh board, bailing (never throwing) on desync. */
export function playPV(fen: string, pvUci: string[]): Chess {
  const g = new Chess(fen);
  for (const u of pvUci) {
    try {
      const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as never });
      if (!m) break;
    } catch {
      break; // PV desync — stop, never throw (gotcha #4)
    }
  }
  return g;
}

/**
 * Net material swing for `me` after the PV plays out from `fenAfter`.
 * Positive = me gains, negative = me loses.
 */
export function materialSwing(fenAfter: string, pv: string[], me: Color): number {
  const them: Color = me === 'w' ? 'b' : 'w';
  const a = new Chess(fenAfter);
  const b = playPV(fenAfter, pv);
  return (
    material(b, me) - material(b, them) - (material(a, me) - material(a, them))
  );
}

export function extractFacts(input: FactInput): Facts {
  const { fenBefore, playedUci, fenAfter, bestLine, afterLine } = input;
  const mover: Color = fenBefore.split(/\s+/)[1] === 'b' ? 'b' : 'w';
  const opponent: Color = mover === 'w' ? 'b' : 'w';

  // Played move description.
  const from = playedUci.slice(0, 2);
  const to = playedUci.slice(2, 4);
  const movedPiece = new Chess(fenBefore).get(from as never);
  const pieceMoved = movedPiece ? NAME[movedPiece.type] : 'piece';
  const sanPlayed = uciToSan(fenBefore, playedUci) ?? playedUci;

  // Best move.
  const bestUci = bestLine.pv[0] ?? null;
  const bestSan = bestUci ? uciToSan(fenBefore, bestUci) : null;

  // Refutation = opponent's best reply after the played move.
  const refutationUci = afterLine.pv[0] ?? null;
  const refutationSan = refutationUci ? uciToSan(fenAfter, refutationUci) : null;
  const refutationIsCapture = refutationUci
    ? isCapture(fenAfter, refutationUci)
    : false;

  // Mate facts (normalized to the mover).
  const moverSign = mover === 'w' ? 1 : -1;
  const bestMateForMover =
    bestLine.mate !== null && bestLine.mate * moverSign > 0;
  const playedMateForMover =
    afterLine.mate !== null && afterLine.mate * moverSign > 0;
  const mateIn = bestMateForMover ? Math.abs(bestLine.mate as number) : null;

  // Material swing after the refutation line.
  const swing = refutationUci
    ? materialSwing(fenAfter, afterLine.pv, mover)
    : 0;

  // Material the best move wins that the played move gave up (a missed win).
  const bestGain = bestUci ? materialSwing(fenBefore, bestLine.pv, mover) : 0;
  const playedGain = materialSwing(fenBefore, [playedUci, ...afterLine.pv], mover);
  // Only a "missed win" when the best line genuinely wins material and the
  // played move captured clearly less of it.
  const missedGain = bestGain >= 1 ? Math.max(0, bestGain - playedGain) : 0;

  // Motifs: what the opponent gets. Scan the position after the played move,
  // and the position after the refutation lands (to catch forks the refutation
  // creates).
  const board1 = boardMap(new Chess(fenAfter));
  const afterRef = refutationUci ? playPV(fenAfter, [refutationUci]) : new Chess(fenAfter);
  const board2 = boardMap(afterRef);
  const focus = refutationUci ? refutationUci.slice(2, 4) : undefined;

  const merged = mergeMotifs([
    ...detectAll(board1, opponent),
    ...detectAll(board2, opponent, focus),
  ]);

  const hangingHit = merged.find((m) => m.motif === 'hanging');
  const hangingPiece = hangingHit?.square
    ? { piece: hangingHit.detail ?? 'piece', square: hangingHit.square }
    : null;

  const top = merged[0] ?? null;

  // Positional fallback: what the best move would have changed.
  const bestFen = bestUci ? playPV(fenBefore, [bestUci]).fen() : fenBefore;
  const featureDelta = topFeatureDelta(bestFen, fenAfter, mover);

  return {
    mover,
    sanPlayed,
    pieceMoved,
    fromSquare: from,
    toSquare: to,
    bestUci,
    bestSan,
    refutationUci,
    refutationSan,
    bestIsMate: bestMateForMover,
    playedIsMate: playedMateForMover,
    mateIn,
    materialSwing: swing,
    refutationIsCapture,
    missedGain,
    opponentMotif: top?.motif ?? null,
    motifs: merged,
    hangingPiece,
    targets: top?.targets ?? [],
    topFeatureDelta: featureDelta,
    winBefore: input.winBefore,
    winAfter: input.winAfter,
    drop: input.winBefore - input.winAfter,
  };
}

/** Deduplicate motif hits by motif+square, keeping the highest value. */
function mergeMotifs(hits: MotifHit[]): MotifHit[] {
  const byKey = new Map<string, MotifHit>();
  for (const h of hits) {
    const key = `${h.motif}|${h.square ?? ''}`;
    const prev = byKey.get(key);
    if (!prev || (h.value ?? 0) > (prev.value ?? 0)) byKey.set(key, h);
  }
  return [...byKey.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

function uciToSan(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    const m = c.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] as never,
    });
    return m ? m.san : null;
  } catch {
    return null;
  }
}

function isCapture(fen: string, uci: string): boolean {
  try {
    const c = new Chess(fen);
    const m = c.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] as never,
    });
    return m ? m.flags.includes('c') || m.flags.includes('e') : false;
  } catch {
    return false;
  }
}
