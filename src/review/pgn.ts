import { Chess } from 'chess.js';

/**
 * Robust PGN loading.
 *
 * chess.js is a standard-chess library: it rejects any FEN whose castling field
 * contains characters outside `KQkq-` (see its validateFen). Chess960 / Fischer
 * Random games encode castling with file letters (e.g. "HAha", "BGbg"), so a
 * plain load throws "Invalid FEN: castling availability is invalid".
 *
 * We try a normal load first; if it fails, we repair the FEN header's castling
 * field and retry (which works for variant games that never actually castle),
 * and otherwise surface a clear "variant not supported" message instead of the
 * cryptic library error.
 */
export function loadGame(pgn: string): Chess {
  // Reject rule-changing variants before we waste an engine on them — their
  // FENs often load fine as standard chess but every evaluation is meaningless.
  const variant = unsupportedVariant(pgn);
  if (variant) {
    throw new Error(
      `${variant} is a chess variant with different rules. Only standard chess is supported right now.`
    );
  }

  const attempt = (text: string): Chess => {
    const c = new Chess();
    c.loadPgn(text);
    return c;
  };

  try {
    return attempt(pgn);
  } catch (e) {
    const repaired = repairPgnFen(pgn);
    if (repaired !== pgn) {
      try {
        return attempt(repaired);
      } catch (e2) {
        throw variantError(pgn, e2 as Error);
      }
    }
    throw variantError(pgn, e as Error);
  }
}

/** Strip any non-standard characters from a FEN's castling field. */
export function sanitizeFenCastling(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length >= 3) {
    const cleaned = parts[2].replace(/[^kKqQ]/g, '');
    parts[2] = cleaned || '-';
  }
  return parts.join(' ');
}

/** Rewrite a PGN's [FEN "..."] header with a sanitized castling field. */
export function repairPgnFen(pgn: string): string {
  return pgn.replace(
    /(\[FEN\s+")([^"]+)("\s*\])/i,
    (_all, open: string, fen: string, close: string) =>
      open + sanitizeFenCastling(fen) + close
  );
}

/** Heuristic: does the PGN declare a non-standard variant? */
export function isLikelyVariant(pgn: string): boolean {
  return /\[Variant\s+"[^"]*(960|Fischer|Random)/i.test(pgn);
}

/**
 * The declared variant name if it's a rule-changing variant we can't evaluate
 * (Atomic, King of the Hill, Three-check, Antichess, Horde, Crazyhouse, …), or
 * null. Default-deny: any Variant tag that isn't standard chess, a custom
 * standard start ("From Position"), or Chess960 (handled separately by repair)
 * is treated as unsupported.
 */
export function unsupportedVariant(pgn: string): string | null {
  const m = pgn.match(/\[Variant\s+"([^"]+)"\]/i);
  if (!m) return null;
  const name = m[1].trim();
  const norm = name.toLowerCase().replace(/[\s_-]/g, '');
  const isStandard =
    norm === 'standard' || norm === 'standardchess' || norm === 'chess' || norm === 'fromposition';
  const is960 = norm.includes('960') || norm.includes('fischer') || norm.includes('random');
  if (isStandard || is960) return null;
  return name;
}

function variantError(pgn: string, e: Error): Error {
  if (isLikelyVariant(pgn) || /castling availability/i.test(e.message)) {
    return new Error(
      'This looks like a Chess960 or variant game. Only standard chess is supported right now.'
    );
  }
  return e;
}
