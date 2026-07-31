import type { ComponentProps } from 'react';
import { Chessboard } from 'react-chessboard';
import { CLASS_COLOR, CLASS_ICON, type MoveClass } from '../review/classify';

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
   * Called when a piece is dropped. `promotion` is the chosen piece
   * ('q' | 'r' | 'b' | 'n') when the move is a pawn promotion, else undefined.
   * Return true to accept the move (piece stays), false to snap it back.
   */
  onPieceDrop?: (from: string, to: string, promotion?: string) => boolean;
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
}: Props) {
  const arrows: [string, string, string][] = [];
  if (bestUci && bestUci.length >= 4) {
    arrows.push([bestUci.slice(0, 2), bestUci.slice(2, 4), CLASS_COLOR.best]);
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  const highlight = playedClass ? CLASS_COLOR[playedClass] : '#e5c14c';
  if (playedFrom) squareStyles[playedFrom] = tint(highlight);
  if (playedTo) squareStyles[playedTo] = tint(highlight);

  return (
    <div style={{ position: 'relative', width: boardWidth, height: boardWidth }}>
      <Chessboard
        position={fen}
        boardWidth={boardWidth}
        boardOrientation={boardOrientation}
        customArrows={arrows as Arrows}
        customSquareStyles={squareStyles}
        arePiecesDraggable={Boolean(onPieceDrop)}
        onPieceDrop={(from, to) => onPieceDrop?.(from, to) ?? false}
        onPromotionPieceSelect={(piece, from, to) => {
          // Fired when the user picks a piece from the built-in promotion
          // dialog. `piece` is like "wQ"; forward its lowercase type.
          if (!piece || !from || !to) return false;
          return onPieceDrop?.(from, to, piece[1].toLowerCase()) ?? false;
        }}
        customBoardStyle={{ borderRadius: '6px' }}
        customDarkSquareStyle={{ backgroundColor: '#769656' }}
        customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
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
    </div>
  );
}

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
