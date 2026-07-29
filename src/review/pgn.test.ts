import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { loadGame, sanitizeFenCastling, repairPgnFen } from './pgn';

describe('sanitizeFenCastling', () => {
  it('strips Chess960 file-letter castling to a valid field', () => {
    const fen = 'nrbqkbrn/pppppppp/8/8/8/8/PPPPPPPP/NRBQKBRN w BGbg - 0 1';
    const out = sanitizeFenCastling(fen);
    expect(out.split(/\s+/)[2]).toBe('-');
    expect(() => new Chess(out)).not.toThrow();
  });

  it('leaves a standard castling field untouched', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(sanitizeFenCastling(fen)).toBe(fen);
  });
});

describe('repairPgnFen', () => {
  it('rewrites a bad FEN header in place', () => {
    const pgn = '[FEN "nrbqkbrn/pppppppp/8/8/8/8/PPPPPPPP/NRBQKBRN w BGbg - 0 1"]\n\n1. e4 e5 *';
    expect(repairPgnFen(pgn)).toContain('w - -');
  });
});

describe('loadGame', () => {
  it('loads a normal PGN', () => {
    const g = loadGame('[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 *');
    expect(g.history().length).toBe(4);
  });

  it('recovers a Chess960-style header that never castles', () => {
    const pgn =
      '[Variant "Chess960"]\n[SetUp "1"]\n' +
      '[FEN "nrbqkbrn/pppppppp/8/8/8/8/PPPPPPPP/NRBQKBRN w BGbg - 0 1"]\n\n1. e4 e5 *';
    const g = loadGame(pgn);
    expect(g.history()).toContain('e4');
  });

  it('gives a clear message for an unsupported variant it cannot repair', () => {
    const pgn =
      '[Variant "Chess960"]\n[SetUp "1"]\n' +
      '[FEN "8/8/8/8/8/8/8/8 w KQkq - 0 1"]\n\n1. e4 *';
    expect(() => loadGame(pgn)).toThrow(/variant/i);
  });
});
