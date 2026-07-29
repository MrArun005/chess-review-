import type { Facts } from './facts';

/**
 * Deterministic FEN hash -> a stable non-negative integer. Used to pick a
 * phrasing so the same position always reads the same way, but different
 * positions across a game vary. (Not cryptographic — just a spreader.)
 */
export function hashFen(fen: string): number {
  let h = 2166136261;
  for (let i = 0; i < fen.length; i++) {
    h ^= fen.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Choose one phrasing from a list, deterministically by FEN. */
export function pickPhrasing(phrasings: string[], fen: string): string {
  if (phrasings.length === 0) return '';
  return phrasings[hashFen(fen) % phrasings.length];
}

/**
 * Fill {{placeholders}} in a template from the fact object. Unknown or empty
 * placeholders collapse gracefully so we never render "undefined".
 */
export function render(template: string, facts: Facts): string {
  const top = facts.motifs[0];
  const values: Record<string, string> = {
    best: facts.bestSan ?? 'the engine move',
    played: facts.sanPlayed,
    refutation: facts.refutationSan ?? 'the reply',
    piece: facts.hangingPiece?.piece ?? facts.pieceMoved,
    square: facts.hangingPiece?.square ?? facts.toSquare,
    mateIn: facts.mateIn != null ? String(facts.mateIn) : '',
    targets: humanTargets(facts.targets),
    motifDetail: top?.detail ?? '',
    topFeatureDelta: facts.topFeatureDelta,
  };

  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim();
}

/** "e5, g6 and c7" style joining of target squares. */
function humanTargets(squares: string[]): string {
  if (squares.length === 0) return '';
  if (squares.length === 1) return squares[0];
  return `${squares.slice(0, -1).join(', ')} and ${squares[squares.length - 1]}`;
}
