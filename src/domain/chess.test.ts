import { describe, it, expect } from 'vitest';
import {
  applyUci,
  chessFromFen,
  fenOf,
  isPromotion,
  lineToSan,
  positionKey,
  sameMove,
  START_FEN,
  uciFromMove,
  uciToSanAt,
} from './chess';
import type { Key } from '@lichess-org/chessground/types';

const fenAfter = (ucis: string[]): string => {
  let c = chessFromFen(START_FEN);
  for (const u of ucis) c = applyUci(c, u);
  return fenOf(c);
};

describe('positionKey', () => {
  it('keeps the first four FEN fields and drops the clocks', () => {
    expect(positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    );
  });

  it('collapses transposing move orders to the same key', () => {
    // Same resulting position after 1.e4, reached directly vs. after a knight
    // tempo dance that bumps the fullmove counter. Full FENs differ on the
    // clocks; the position key must not.
    const direct = fenAfter(['e2e4']);
    const viaTempo = fenAfter(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'e2e4']);
    expect(direct).not.toBe(viaTempo); // full FENs differ (fullmove counter)
    expect(positionKey(direct)).toBe(positionKey(viaTempo));
  });

  it('distinguishes positions that differ only by side to move', () => {
    const afterE4 = fenAfter(['e2e4']);
    const afterE4E5 = fenAfter(['e2e4', 'e7e5']);
    expect(positionKey(afterE4)).not.toBe(positionKey(afterE4E5));
  });
});

describe('uciFromMove', () => {
  it('auto-promotes a pawn reaching the last rank to a queen', () => {
    // White pawn on e7, black king tucked away — e7e8 must become e7e8q.
    const chess = chessFromFen('4k3/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(uciFromMove(chess, 'e7' as Key, 'e8' as Key)).toBe('e7e8q');
  });

  it('does not promote a non-pawn move to the last rank', () => {
    const chess = chessFromFen('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    expect(uciFromMove(chess, 'a1' as Key, 'a8' as Key)).toBe('a1a8');
  });

  it('promotes to the requested piece, both colors', () => {
    const white = chessFromFen('4k3/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(uciFromMove(white, 'e7' as Key, 'e8' as Key, 'n')).toBe('e7e8n');
    expect(uciFromMove(white, 'e7' as Key, 'e8' as Key, 'r')).toBe('e7e8r');
    const black = chessFromFen('4k3/8/8/8/8/8/4p3/2K5 b - - 0 1');
    expect(uciFromMove(black, 'e2' as Key, 'e1' as Key, 'b')).toBe('e2e1b');
  });

  it('isPromotion flags only pawn moves onto the last rank', () => {
    const chess = chessFromFen('4k3/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(isPromotion(chess, 'e7' as Key, 'e8' as Key)).toBe(true);
    expect(isPromotion(chess, 'e1' as Key, 'e2' as Key)).toBe(false);
    const rook = chessFromFen('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    expect(isPromotion(rook, 'a1' as Key, 'a8' as Key)).toBe(false);
  });

  it('normalizes king-on-rook short castle to king-target form', () => {
    // White to castle kingside: rook on h1, king on e1.
    const chess = chessFromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    expect(uciFromMove(chess, 'e1' as Key, 'h1' as Key)).toBe('e1g1');
    expect(uciFromMove(chess, 'e1' as Key, 'g1' as Key)).toBe('e1g1');
  });

  it('normalizes king-on-rook long castle to king-target form', () => {
    const chess = chessFromFen('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    expect(uciFromMove(chess, 'e1' as Key, 'a1' as Key)).toBe('e1c1');
    expect(uciFromMove(chess, 'e1' as Key, 'c1' as Key)).toBe('e1c1');
  });
});

describe('sameMove', () => {
  it('treats both castling conventions as equal', () => {
    const chess = chessFromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    expect(sameMove(chess, 'e1g1', 'e1h1')).toBe(true);
  });

  it('does not equate distinct moves', () => {
    const chess = chessFromFen(START_FEN);
    expect(sameMove(chess, 'e2e4', 'd2d4')).toBe(false);
  });

  it('falls back to identity for legacy data with no chess context match', () => {
    const chess = chessFromFen(START_FEN);
    expect(sameMove(chess, 'e2e4', 'e2e4')).toBe(true);
  });
});

describe('lineToSan', () => {
  it('renders a standard opening sequence', () => {
    expect(lineToSan(['e2e4', 'e7e5', 'g1f3', 'b8c6'])).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
    ]);
  });

  it('anchors on a custom start FEN for chapters that begin past the opening', () => {
    // A position where it is black to move; without the startFen anchor the
    // move would be illegal from the initial board and render as a placeholder.
    const startFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(lineToSan(['g1f3'], startFen)).toEqual(['Nf3']);
  });

  it('passes through an unparseable token instead of throwing', () => {
    expect(lineToSan(['not-a-move'])).toEqual(['not-a-move']);
  });
});

describe('uciToSanAt', () => {
  it('converts a single UCI move at a given FEN', () => {
    expect(uciToSanAt(START_FEN, 'e2e4')).toBe('e4');
  });
});
