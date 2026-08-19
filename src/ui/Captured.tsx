/**
 * Captured-pieces tray with material advantage — the chess.com strip that sits
 * above and below the board. Each player's tray shows the enemy pieces they've
 * taken, and the player who is ahead gets a "+N" material badge.
 *
 * Everything is derived from the FEN (start material minus what's on the board),
 * so it needs no move history and stays correct as you step through a game.
 *
 * The piece icons are the exact same SVGs the board uses (react-chessboard's
 * default set), so they look identical to the pieces in play.
 */
import { PIECE_SVG } from './pieceSvgs';

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q';

const ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
const START: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

export interface CapturedInfo {
  /** Black pieces captured by White, by type. */
  byWhite: Record<PieceType, number>;
  /** White pieces captured by Black, by type. */
  byBlack: Record<PieceType, number>;
  /** Material balance in points, positive = White ahead. */
  net: number;
}

export function computeCaptured(fen: string): CapturedInfo {
  const placement = fen.split(/\s+/)[0] ?? '';
  const w: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const b: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const ch of placement) {
    const lower = ch.toLowerCase();
    if (lower === 'p' || lower === 'n' || lower === 'b' || lower === 'r' || lower === 'q') {
      const t = lower as PieceType;
      if (ch === ch.toUpperCase()) w[t]++;
      else b[t]++;
    }
  }
  const byWhite = {} as Record<PieceType, number>;
  const byBlack = {} as Record<PieceType, number>;
  let netW = 0;
  let netB = 0;
  for (const t of ORDER) {
    byWhite[t] = Math.max(0, START[t] - b[t]); // black pieces missing = White took them
    byBlack[t] = Math.max(0, START[t] - w[t]);
    netW += byWhite[t] * VALUE[t];
    netB += byBlack[t] * VALUE[t];
  }
  return { byWhite, byBlack, net: netW - netB };
}

interface TrayProps {
  info: CapturedInfo;
  /** Whose captures to show. */
  side: 'w' | 'b';
  /**
   * Horizontal nudge (px) so the centered strip lines up with the board when an
   * eval bar shifts the board off the column centre. 0 when there's no eval bar.
   */
  offset?: number;
}

export function CapturedTray({ info, side, offset = 0 }: TrayProps) {
  const pieces = side === 'w' ? info.byWhite : info.byBlack;
  const advantage = side === 'w' ? info.net : -info.net;

  // White's tray holds the Black pieces it captured (army 'b'), and vice-versa.
  const army: 'w' | 'b' = side === 'w' ? 'b' : 'w';

  const svgs: string[] = [];
  for (const t of ORDER) {
    const svg = PIECE_SVG[army + t.toUpperCase()];
    if (!svg) continue;
    for (let i = 0; i < pieces[t]; i++) svgs.push(svg);
  }

  // The row always reserves its height (so nothing jumps as pieces fall), but
  // the "plate" only appears once there's something to show.
  const empty = svgs.length === 0 && advantage <= 0;

  return (
    <div className="captured" style={offset ? { transform: `translateX(${offset}px)` } : undefined}>
      {!empty && (
        <div className="captured-plate">
          <span className="captured-pieces">
            {svgs.map((svg, i) => (
              <span
                key={i}
                className="captured-piece"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ))}
          </span>
          {advantage > 0 && <span className="captured-adv">+{advantage}</span>}
        </div>
      )}
    </div>
  );
}
