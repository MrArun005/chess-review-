import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { loadGame, sanitizeFenCastling, repairPgnFen, unsupportedVariant } from './pgn';

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

  it('rejects a rule-changing variant by name', () => {
    const pgn = '[Variant "King of the Hill"]\n\n1. e4 e5 *';
    expect(() => loadGame(pgn)).toThrow(/King of the Hill/);
  });

  it('allows a standard game with a Variant "Standard" tag', () => {
    const g = loadGame('[Variant "Standard"]\n\n1. e4 e5 *');
    expect(g.history()).toContain('e4');
  });

  it('allows a lichess "From Position" (standard rules) game', () => {
    const pgn =
      '[Variant "From Position"]\n[SetUp "1"]\n' +
      '[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 e5 *';
    expect(g(pgn)).toContain('e4');
    function g(p: string) {
      return loadGame(p).history();
    }
  });
});

describe('unsupportedVariant', () => {
  it('flags rule-changing variants and passes standard/960 through', () => {
    expect(unsupportedVariant('[Variant "Atomic"]\n\n1. e4 *')).toBe('Atomic');
    expect(unsupportedVariant('[Variant "Three-check"]\n\n1. e4 *')).toBe('Three-check');
    expect(unsupportedVariant('[Variant "Standard"]\n\n1. e4 *')).toBeNull();
    expect(unsupportedVariant('[Variant "Chess960"]\n\n1. e4 *')).toBeNull();
    expect(unsupportedVariant('1. e4 e5 *')).toBeNull();
  });
});
