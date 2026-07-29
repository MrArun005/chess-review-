import { Chess } from 'chess.js';
import { boardMap, type Color } from './attacks';
import { detectAll } from './motifs';
import { positiveFeature } from './features';
import type { Explanation } from './engine';
import type { MoveClass } from '../review/classify';

/**
 * Explain why a GOOD move was good — the positive counterpart to the rule
 * engine, which only critiques mistakes. Purely deterministic: it reads the
 * motifs the move creates, whether it wins material, and the biggest positional
 * gain, then renders one line. Nothing is generated, so nothing is invented.
 */
export function explainStrength(
  fenBefore: string,
  playedUci: string,
  fenAfter: string,
  cls: MoveClass
): Explanation[] {
  const mover: Color = fenBefore.split(/\s+/)[1] === 'b' ? 'b' : 'w';
  const landed = playedUci.slice(2, 4);
  const san = uciToSan(fenBefore, playedUci) ?? playedUci;

  // Book and forced moves speak for themselves.
  if (cls === 'book' || cls === 'forced') return [];

  const text = pick(fenBefore, fenAfter, playedUci, mover, landed, san, cls);
  return text ? [{ ruleId: 'strength', category: 'praise', text }] : [];
}

function pick(
  fenBefore: string,
  fenAfter: string,
  playedUci: string,
  mover: Color,
  landed: string,
  san: string,
  cls: MoveClass
): string | null {
  // Threats the move creates for the mover (focus on the piece that landed).
  const boardAfter = boardMap(new Chess(fenAfter));
  const created = detectAll(boardAfter, mover, landed);
  const fork = created.find((h) => h.motif === 'fork');
  const pinLike = created.find((h) => h.motif === 'pin' || h.motif === 'skewer');
  const winsPiece = created.find((h) => h.motif === 'hanging' && (h.value ?? 0) >= 2);

  if (cls === 'brilliant') {
    const d = fork ?? pinLike ?? winsPiece;
    return d?.detail
      ? `Brilliant — a sacrifice that ${d.detail}.`
      : `Brilliant — a sound sacrifice that keeps the initiative.`;
  }
  if (cls === 'great') {
    return `The only move that keeps the advantage.`;
  }
  if (fork) {
    return `${san} forks ${humanTargets(fork.targets ?? [])}.`;
  }
  if (pinLike?.detail) {
    return `${san} — ${pinLike.detail}.`;
  }
  if (winsPiece && isCapture(fenBefore, playedUci)) {
    return `${san} wins material.`;
  }
  const feat = positiveFeature(fenBefore, fenAfter, mover);
  if (feat) return `${san} — ${feat}.`;
  return null;
}

function humanTargets(squares: string[]): string {
  if (squares.length === 0) return 'two pieces';
  if (squares.length === 1) return squares[0];
  return `${squares.slice(0, -1).join(', ')} and ${squares[squares.length - 1]}`;
}

function uciToSan(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never });
    return m ? m.san : null;
  } catch {
    return null;
  }
}

function isCapture(fen: string, uci: string): boolean {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never });
    return m ? m.flags.includes('c') || m.flags.includes('e') : false;
  } catch {
    return false;
  }
}
