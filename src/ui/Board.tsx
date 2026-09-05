import { useMemo, useState, type ComponentProps } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { CLASS_COLOR, CLASS_ICON, type MoveClass } from '../review/classify';
import { useBoardSettings, THEMES } from './boardSettings';
import { PIECE_SVG } from './pieceSvgs';

type Arrows = ComponentProps<typeof Chessboard>['customArrows'];

interface Props {
  fen: string;
  /** Engine best move as UCI, drawn as an arrow. */
  bestUci?: string | null;
  /** The move actually played (from,to) to highlight. */
  playedFrom?: string;
  playedTo?: string;
  playedClass?: MoveClass;
  /** Classification badge to stamp on a destination square (chess.com style). */
  badge?: { square: string; cls: MoveClass } | null;
  /** The checkmated king's square — draws a checkmate marker on it. */
  mateSquare?: string | null;
  boardWidth: number;
  boardOrientation?: 'white' | 'black';
  /**
   * Called when a piece is dropped/clicked into place. `promotion` is the chosen
   * piece ('q' | 'r' | 'b' | 'n') for a pawn promotion, else undefined. Return
   * true to accept the move (piece stays), false to snap it back.
   */
  onPieceDrop?: (from: string, to: string, promotion?: string) => boolean;
  /**
   * The colour the user controls. When set, only that colour's pieces are
   * draggable/selectable, and a move made while it is NOT that colour's turn is
   * emitted as a *premove* (see onPremove) instead of played immediately.
   */
  userColor?: 'w' | 'b';
  /** A queued premove to highlight, if any. */
  premove?: { from: string; to: string } | null;
  /** Called when the user queues a premove (during the opponent's turn). */
  onPremove?: (from: string, to: string) => void;
  /** Called on right-click — used to cancel a queued premove. */
  onCancelPremove?: () => void;
}

export function Board({
  fen,
  bestUci,
  playedFrom,
  playedTo,
  playedClass,
  badge,
  mateSquare,
  boardWidth,
  boardOrientation = 'white',
  onPieceDrop,
  userColor,
  premove,
  onPremove,
  onCancelPremove,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string; color: 'w' | 'b' } | null>(null);
  const { theme, coords } = useBoardSettings();
  const palette = THEMES[theme];

  const arrows: [string, string, string][] = [];
  if (bestUci && bestUci.length >= 4) {
    arrows.push([bestUci.slice(0, 2), bestUci.slice(2, 4), CLASS_COLOR.best]);
  }

  const interactive = Boolean(onPieceDrop);
  const turn: 'w' | 'b' = fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
  // Premove mode: the user may move, but it isn't their turn yet.
  const premoveMode = Boolean(userColor && onPremove && turn !== userColor);
  // Whose pieces the user may pick up right now.
  const activeColor: 'w' | 'b' = premoveMode ? (userColor as 'w' | 'b') : turn;

  const board = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  // Legal destinations for the selected piece (for the move dots). In premove
  // mode the target isn't restricted (the position will have changed), so we
  // skip the dots there.
  const dests = useMemo(() => {
    if (!selected || !board || premoveMode) return [] as string[];
    try {
      return board.moves({ square: selected as never, verbose: true }).map((m) => m.to as string);
    } catch {
      return [] as string[];
    }
  }, [selected, board, premoveMode]);

  const ownsPiece = (square: string): boolean => {
    const p = board?.get(square as never);
    return !!p && p.color === activeColor;
  };

  const isPromotion = (from: string, to: string): boolean => {
    const p = board?.get(from as never);
    if (!p || p.type !== 'p') return false;
    return (p.color === 'w' && to[1] === '8') || (p.color === 'b' && to[1] === '1');
  };

  /** Play a move immediately, or queue it as a premove if it isn't our turn. */
  const commit = (from: string, to: string, promo?: string): boolean => {
    if (premoveMode) {
      onPremove?.(from, to);
      return false; // snap back; the premove highlight shows it's queued
    }
    return onPieceDrop?.(from, to, promo) ?? false;
  };

  const handleSquareClick = (square: string) => {
    if (!interactive) return;
    if (selected) {
      if (square === selected) {
        setSelected(null);
        return;
      }
      // Clicking another of your own pieces re-selects it.
      if (ownsPiece(square)) {
        setSelected(square);
        return;
      }
      // Otherwise treat as the destination (any square in premove mode).
      if (premoveMode || dests.includes(square)) {
        if (!premoveMode && isPromotion(selected, square)) {
          const p = board?.get(selected as never);
          setPendingPromo({ from: selected, to: square, color: (p?.color as 'w' | 'b') ?? activeColor });
          setSelected(null);
          return;
        }
        commit(selected, square);
      }
      setSelected(null);
      return;
    }
    if (ownsPiece(square)) setSelected(square);
  };

  const choosePromo = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromo) return;
    const { from, to } = pendingPromo;
    setPendingPromo(null);
    setSelected(null);
    commit(from, to, piece);
  };

  const squareStyles: Record<string, React.CSSProperties> = {};
  const highlight = playedClass ? CLASS_COLOR[playedClass] : '#e5c14c';
  if (playedFrom) squareStyles[playedFrom] = tint(highlight);
  if (playedTo) squareStyles[playedTo] = tint(highlight);
  // Selected square + legal-move dots for click-to-move.
  if (selected) squareStyles[selected] = { ...squareStyles[selected], ...tint('#e5c14c') };
  for (const d of dests) {
    squareStyles[d] = { ...squareStyles[d], ...dot(Boolean(board?.get(d as never))) };
  }
  // Queued premove highlight.
  if (premove) {
    squareStyles[premove.from] = { ...squareStyles[premove.from], ...tint('#5a9bd4') };
    squareStyles[premove.to] = { ...squareStyles[premove.to], ...tint('#5a9bd4') };
  }

  return (
    <div style={{ position: 'relative', width: boardWidth, height: boardWidth }}>
      <Chessboard
        position={fen}
        boardWidth={boardWidth}
        boardOrientation={boardOrientation}
        customArrows={arrows as Arrows}
        customSquareStyles={squareStyles}
        arePiecesDraggable={interactive}
        isDraggablePiece={({ piece }) =>
          interactive && (!userColor || piece[0] === userColor)
        }
        onPieceDrop={(from, to) => {
          setSelected(null);
          return commit(from, to);
        }}
        onSquareClick={handleSquareClick}
        onSquareRightClick={() => onCancelPremove?.()}
        onPromotionCheck={(from, to, piece) => {
          // Intercept promotions to show our own centered picker instead of
          // react-chessboard's dialog (which can render off-screen on mobile).
          const isPromo =
            !!piece &&
            piece[1]?.toLowerCase() === 'p' &&
            ((piece[0] === 'w' && to[1] === '8') || (piece[0] === 'b' && to[1] === '1'));
          if (isPromo && !premoveMode) {
            setPendingPromo({ from, to, color: piece[0] as 'w' | 'b' });
          }
          return false; // never use the built-in dialog
        }}
        showBoardNotation={coords}
        customBoardStyle={{ borderRadius: '6px' }}
        customDarkSquareStyle={{ backgroundColor: palette.dark }}
        customLightSquareStyle={{ backgroundColor: palette.light }}
      />
      {badge && (
        <MoveBadge
          square={badge.square}
          cls={badge.cls}
          boardWidth={boardWidth}
          orientation={boardOrientation}
        />
      )}
      {mateSquare && (
        <MateMarker square={mateSquare} boardWidth={boardWidth} orientation={boardOrientation} />
      )}
      {pendingPromo && (
        <div
          className="promo-overlay"
          onClick={() => setPendingPromo(null)}
          role="dialog"
          aria-label="Choose promotion piece"
        >
          <div className="promo-card" onClick={(e) => e.stopPropagation()}>
            {(['q', 'r', 'b', 'n'] as const).map((t) => (
              <button
                key={t}
                className="promo-choice"
                style={{ width: Math.round(boardWidth / 5), height: Math.round(boardWidth / 5) }}
                onClick={() => choosePromo(t)}
                aria-label={PROMO_LABEL[t]}
                title={PROMO_LABEL[t]}
                dangerouslySetInnerHTML={{ __html: PIECE_SVG[pendingPromo.color + t.toUpperCase()] ?? '' }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const PROMO_LABEL: Record<'q' | 'r' | 'b' | 'n', string> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
};

/** A checkmate marker centered on the mated king's square. */
function MateMarker({
  square,
  boardWidth,
  orientation,
}: {
  square: string;
  boardWidth: number;
  orientation: 'white' | 'black';
}) {
  const sq = boardWidth / 8;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  const col = orientation === 'white' ? file : 7 - file;
  const rowFromTop = orientation === 'white' ? 7 - rank : rank;
  const size = Math.max(18, Math.min(34, sq * 0.5));
  const left = col * sq + sq - size * 0.78;
  const top = rowFromTop * sq - size * 0.22;
  return (
    <div className="mate-marker" style={{ left, top, width: size, height: size, fontSize: size * 0.6 }}>
      #
    </div>
  );
}

/** A classification badge pinned to the top-right of a square. */
function MoveBadge({
  square,
  cls,
  boardWidth,
  orientation,
}: {
  square: string;
  cls: MoveClass;
  boardWidth: number;
  orientation: 'white' | 'black';
}) {
  const sq = boardWidth / 8;
  const file = square.charCodeAt(0) - 97; // a=0
  const rank = Number(square[1]) - 1; // rank1=0
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;

  const col = orientation === 'white' ? file : 7 - file;
  const rowFromTop = orientation === 'white' ? 7 - rank : rank;

  const size = Math.max(16, Math.min(30, sq * 0.44));
  // Nudge to the top-right corner of the destination square.
  const left = col * sq + sq - size * 0.72;
  const top = rowFromTop * sq - size * 0.28;

  return (
    <div
      className="move-badge"
      style={{
        left,
        top,
        width: size,
        height: size,
        background: CLASS_COLOR[cls],
        fontSize: size * 0.5,
      }}
    >
      {CLASS_ICON[cls]}
    </div>
  );
}

function tint(color: string): React.CSSProperties {
  return { background: `${color}55`, boxShadow: `inset 0 0 0 3px ${color}aa` };
}

/** Legal-move indicator: a centered dot for a quiet move, a ring for a capture. */
function dot(isCapture: boolean): React.CSSProperties {
  return isCapture
    ? { boxShadow: 'inset 0 0 0 4px rgba(20,18,15,0.32)', borderRadius: '50%' }
    : {
        background:
          'radial-gradient(circle, rgba(20,18,15,0.32) 20%, transparent 22%)',
      };
}
