/** Names, one-line lessons and groups for the lichess theme tags in the pack. */

export interface ThemeInfo {
  name: string;
  /** What to look for — shown as the theme hint and on the theme card. */
  lesson: string;
  group: ThemeGroup;
}

export type ThemeGroup = 'Checkmates' | 'Tactics' | 'Advanced' | 'Endgames' | 'Phase & length';

export const THEMES: Record<string, ThemeInfo> = {
  mateIn1: { name: 'Mate in 1', group: 'Checkmates', lesson: 'One move ends it. Check every check.' },
  mateIn2: { name: 'Mate in 2', group: 'Checkmates', lesson: 'Force the king into a net, then close it. Start with checks and captures.' },
  mateIn3: { name: 'Mate in 3', group: 'Checkmates', lesson: 'Calculate forcing moves to the end — every reply, not just the one you hope for.' },
  mateIn4: { name: 'Mate in 4', group: 'Checkmates', lesson: 'A long forcing sequence. Find the pattern first, then the move order.' },
  mateIn5: { name: 'Mate in 5+', group: 'Checkmates', lesson: 'Deep calculation. Visualise the final mating picture and work backwards.' },
  backRankMate: { name: 'Back-rank mate', group: 'Checkmates', lesson: 'A king boxed in by its own pawns dies to a rook or queen on the last rank.' },
  smotheredMate: { name: 'Smothered mate', group: 'Checkmates', lesson: 'A knight mates a king that is surrounded by its own pieces. Often after a queen sac.' },
  arabianMate: { name: 'Arabian mate', group: 'Checkmates', lesson: 'Rook and knight together: the knight guards the rook and the escape square.' },
  anastasiaMate: { name: "Anastasia's mate", group: 'Checkmates', lesson: 'Knight blocks the king in on the edge; a rook or queen mates along the file.' },
  bodenMate: { name: "Boden's mate", group: 'Checkmates', lesson: 'Two bishops on crossing diagonals mate a king its own pieces block in.' },
  doubleBishopMate: { name: 'Double-bishop mate', group: 'Checkmates', lesson: 'Two bishops on adjacent diagonals cover every flight square.' },
  hookMate: { name: 'Hook mate', group: 'Checkmates', lesson: 'Rook, knight and pawn: the pawn guards the knight, the knight guards the rook.' },
  dovetailMate: { name: 'Dovetail mate', group: 'Checkmates', lesson: "The queen mates next to the king; the king's own pieces block the diagonal escapes." },

  fork: { name: 'Fork', group: 'Tactics', lesson: 'One piece attacks two targets at once. Look for loose pieces and the king.' },
  pin: { name: 'Pin', group: 'Tactics', lesson: 'Freeze a piece against something more valuable behind it — then attack it again.' },
  skewer: { name: 'Skewer', group: 'Tactics', lesson: 'Attack a valuable piece so that the one behind it falls when it moves.' },
  discoveredAttack: { name: 'Discovered attack', group: 'Tactics', lesson: 'Move one piece out of the way to unleash another. The moving piece gets a free move.' },
  discoveredCheck: { name: 'Discovered check', group: 'Tactics', lesson: 'Unmask a check — the piece that moves can go almost anywhere and grab something.' },
  doubleCheck: { name: 'Double check', group: 'Tactics', lesson: 'Two checks at once: the king must move. Nothing can block or capture both.' },
  hangingPiece: { name: 'Hanging piece', group: 'Tactics', lesson: 'Something is undefended. Count attackers and defenders on every piece.' },
  trappedPiece: { name: 'Trapped piece', group: 'Tactics', lesson: 'A piece with no safe squares. Take away its last exit, then win it.' },
  sacrifice: { name: 'Sacrifice', group: 'Tactics', lesson: 'Give material to get something bigger. Calculate what you get back, concretely.' },
  promotion: { name: 'Promotion', group: 'Tactics', lesson: 'Get a pawn to the last rank — clear the path or deflect the blocker.' },

  deflection: { name: 'Deflection', group: 'Advanced', lesson: 'Lure a defender away from the square or piece it is guarding.' },
  attraction: { name: 'Attraction', group: 'Advanced', lesson: 'Force a piece (often the king) onto a square where it gets hit by a tactic.' },
  clearance: { name: 'Clearance', group: 'Advanced', lesson: 'Vacate a square or line — with tempo — so another piece can use it.' },
  interference: { name: 'Interference', group: 'Advanced', lesson: 'Drop a piece between two enemy pieces to cut the line between them.' },
  intermezzo: { name: 'Intermezzo', group: 'Advanced', lesson: 'Before the obvious recapture, insert a stronger in-between move.' },
  xRayAttack: { name: 'X-ray', group: 'Advanced', lesson: 'A piece attacks or defends a square through an enemy piece.' },
  capturingDefender: { name: 'Remove the defender', group: 'Advanced', lesson: 'Capture the piece that holds the position together, then take what it guarded.' },
  quietMove: { name: 'Quiet move', group: 'Advanced', lesson: 'No check, no capture — a calm move that sets up an unstoppable threat.' },
  defensiveMove: { name: 'Defensive move', group: 'Advanced', lesson: 'The only move that holds. Find the threat first, then the precise answer.' },
  zugzwang: { name: 'Zugzwang', group: 'Advanced', lesson: 'Make a move that leaves your opponent with only bad moves.' },
  underPromotion: { name: 'Underpromotion', group: 'Advanced', lesson: 'Promote to a knight, rook or bishop — the queen would be wrong here.' },
  exposedKing: { name: 'Exposed king', group: 'Advanced', lesson: 'The king has lost its shelter. Bring pieces with tempo.' },
  kingsideAttack: { name: 'Kingside attack', group: 'Advanced', lesson: 'Break open the castled king. Count attackers against defenders.' },
  queensideAttack: { name: 'Queenside attack', group: 'Advanced', lesson: 'Open lines against a king castled long.' },
  attackingF2F7: { name: 'Attacking f2/f7', group: 'Advanced', lesson: 'The weakest square in the opening — guarded only by the king.' },
  advancedPawn: { name: 'Advanced pawn', group: 'Advanced', lesson: 'A pawn deep in enemy territory is a tactical weapon. Use it or stop it.' },
  enPassant: { name: 'En passant', group: 'Advanced', lesson: 'The special pawn capture — right now or never.' },
  castling: { name: 'Castling', group: 'Advanced', lesson: 'Sometimes the strongest move is getting the king safe and the rook into play.' },
  equality: { name: 'Save the draw', group: 'Advanced', lesson: 'You are worse. Find the move that holds the balance.' },

  rookEndgame: { name: 'Rook endgame', group: 'Endgames', lesson: 'Active rook, active king. Rooks belong behind passed pawns.' },
  pawnEndgame: { name: 'Pawn endgame', group: 'Endgames', lesson: 'Opposition, key squares, counting tempi. Every tempo decides.' },
  queenEndgame: { name: 'Queen endgame', group: 'Endgames', lesson: 'Checks, checks, checks — and watch for perpetual.' },
  bishopEndgame: { name: 'Bishop endgame', group: 'Endgames', lesson: 'Pawns on the colour your bishop cannot control are the targets.' },
  knightEndgame: { name: 'Knight endgame', group: 'Endgames', lesson: 'Knights are short-range: outside passers are deadly against them.' },
  queenRookEndgame: { name: 'Queen & rook endgame', group: 'Endgames', lesson: 'Heavy pieces — king safety still matters more than pawns.' },

  opening: { name: 'Opening', group: 'Phase & length', lesson: 'Tactics from the first moves — traps and early punishments.' },
  middlegame: { name: 'Middlegame', group: 'Phase & length', lesson: 'Full-board tactics.' },
  endgame: { name: 'Endgame', group: 'Phase & length', lesson: 'Few pieces, exact calculation.' },
  oneMove: { name: 'One-mover', group: 'Phase & length', lesson: 'A single move wins. Speed and pattern recognition.' },
  short: { name: 'Short (2 moves)', group: 'Phase & length', lesson: 'Two-move combinations.' },
  long: { name: 'Long (3 moves)', group: 'Phase & length', lesson: 'Three-move combinations — see the whole line before you move.' },
  veryLong: { name: 'Very long (4+)', group: 'Phase & length', lesson: 'Four moves or more. This is where calculation is built.' },
};

export const GROUPS: ThemeGroup[] = ['Checkmates', 'Tactics', 'Advanced', 'Endgames', 'Phase & length'];

/** Themes worth tracking as strengths/weaknesses (not phase or length tags). */
export const MOTIF_THEMES = Object.keys(THEMES).filter((t) => THEMES[t].group !== 'Phase & length');

export const themeName = (t: string) => THEMES[t]?.name ?? t;

/**
 * The most specific known theme of a puzzle, for its hint: a named mating
 * pattern beats an advanced idea, which beats a basic tactic, which beats a
 * bare "mate in N" or endgame type.
 */
export function primaryTheme(themes: string[]): string | null {
  const rank = (t: string) => {
    const g = THEMES[t]?.group;
    if (!g || g === 'Phase & length') return -1;
    if (g === 'Checkmates') return t.startsWith('mateIn') ? 1 : 4;
    return g === 'Advanced' ? 3 : g === 'Tactics' ? 2 : 0.5;
  };
  let best: string | null = null;
  for (const t of themes) if (rank(t) >= 0 && (best === null || rank(t) > rank(best))) best = t;
  return best;
}
