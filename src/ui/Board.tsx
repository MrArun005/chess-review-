import type { ComponentProps } from 'react';
import { Chessboard } from 'react-chessboard';
import { CLASS_COLOR, type MoveClass } from '../review/classify';

type Arrows = ComponentProps<typeof Chessboard>['customArrows'];

interface Props {
  fen: string;
  /** Engine best move as UCI, drawn as an arrow. */
  bestUci?: string | null;
  /** The move actually played (from,to) to highlight. */
  playedFrom?: string;
  playedTo?: string;
  playedClass?: MoveClass;
  boardWidth: number;
  onPieceDrop?: (from: string, to: string) => boolean;
}

export function Board({
  fen,
  bestUci,
  playedFrom,
  playedTo,
  playedClass,
  boardWidth,
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
    <Chessboard
      position={fen}
      boardWidth={boardWidth}
      customArrows={arrows as Arrows}
      customSquareStyles={squareStyles}
      arePiecesDraggable={Boolean(onPieceDrop)}
      onPieceDrop={(from, to) => onPieceDrop?.(from, to) ?? false}
      customBoardStyle={{ borderRadius: '6px' }}
      customDarkSquareStyle={{ backgroundColor: '#769656' }}
      customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
    />
  );
}

function tint(color: string): React.CSSProperties {
  return { background: `${color}55`, boxShadow: `inset 0 0 0 3px ${color}aa` };
}
