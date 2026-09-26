/**
 * SAN → words for the coach voice: "Nxe5+" → "Knight takes E5, check".
 * Files are upper-cased so a speech engine says "A4" as a square, not "a 4".
 */

const PIECE: Record<string, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };
const PROMO: Record<string, string> = { Q: 'a queen', R: 'a rook', B: 'a bishop', N: 'a knight' };

const SAN = /^([KQRBN])?([a-h]?[1-8]?)?(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?$/;

export function spokenSan(san: string): string {
  const s = san.replace(/[!?]+$/, '');
  const suffix = s.endsWith('#') ? ', checkmate' : s.endsWith('+') ? ', check' : '';
  if (s.startsWith('O-O-O')) return `Castles long${suffix}`;
  if (s.startsWith('O-O')) return `Castles${suffix}`;
  const m = SAN.exec(s);
  if (!m) return san;
  const [, piece, from = '', capture, to, promo] = m;
  const sq = to.toUpperCase();
  let words: string;
  if (piece) {
    const d = from ? ` ${from.toUpperCase()}` : '';
    words = `${PIECE[piece]}${d} ${capture ? 'takes' : 'to'} ${sq}`;
  } else {
    // Pawn: a capture names the file it came from ("exd5").
    words = capture ? `${from.toUpperCase()} pawn takes ${sq}` : `Pawn to ${sq}`;
  }
  if (promo) words += `, promotes to ${PROMO[promo]}`;
  return words + suffix;
}

/** Upper-case the squares in prose ("on h7" → "on H7") so they are read as squares. */
export const speakSquares = (text: string) => text.replace(/\b([a-h])([1-8])\b/g, (_, f: string, r: string) => f.toUpperCase() + r);
