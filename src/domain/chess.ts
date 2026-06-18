import { Chess } from 'chessops/chess';
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { makeSquare, parseUci, parseSquare } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import type { Key, Dests } from '@lichess-org/chessground/types';

export const START_FEN = INITIAL_FEN;

export function chessFromFen(fen: string): Chess {
  const setup = parseFen(fen).unwrap();
  return Chess.fromSetup(setup).unwrap();
}

export function fenOf(chess: Chess): string {
  return makeFen(chess.toSetup());
}

export function legalDests(chess: Chess): Dests {
  return chessgroundDests(chess);
}

export function applyUci(chess: Chess, uci: string): Chess {
  const move = parseUci(uci);
  if (!move) throw new Error(`Invalid UCI: ${uci}`);
  const next = chess.clone();
  next.play(move);
  return next;
}

export function turnColor(chess: Chess): 'white' | 'black' {
  return chess.turn;
}

/**
 * Build a UCI string from chessground (orig, dest) coords.
 * Auto-promotes pawn moves to the last rank into a queen — sufficient for
 * opening drills. Castling moves get rewritten to the king-target form
 * (e.g. e1c1 / e1g1) regardless of whether the user dropped the king on the
 * castling square or directly on its rook (Chess960-style).
 */
export function uciFromMove(chess: Chess, orig: Key, dest: Key): string {
  const sq = parseSquare(orig);
  if (sq !== undefined) {
    const piece = chess.board.get(sq);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) {
      return `${orig}${dest}q`;
    }
  }
  return normalizeCastleUci(chess, `${orig}${dest}`);
}

/**
 * Rewrite a king move that lands on its own rook (Chess960-style castling)
 * into the standard king-target form (king moves two squares: e1c1/e1g1,
 * e8c8/e8g8). All other UCIs are passed through unchanged. Internal helper
 * for `uciFromMove` and `sameMove` — no consumer outside the module.
 */
function normalizeCastleUci(chess: Chess, uci: string): string {
  if (uci.length < 4) return uci;
  const fromKey = uci.slice(0, 2);
  const toKey = uci.slice(2, 4);
  const promo = uci.length > 4 ? uci.slice(4) : '';
  const fromSq = parseSquare(fromKey);
  const toSq = parseSquare(toKey);
  if (fromSq === undefined || toSq === undefined) return uci;
  const piece = chess.board.get(fromSq);
  if (piece?.role !== 'king') return uci;
  const target = chess.board.get(toSq);
  if (target?.role !== 'rook' || target.color !== piece.color) return uci;
  const fromFile = fromSq % 8;
  const toFile = toSq % 8;
  const rank = Math.floor(fromSq / 8);
  // Long castle when rook is on the queenside (file < king's), king lands on c.
  const kingTargetFile = toFile > fromFile ? 6 : 2;
  return `${fromKey}${makeSquare(rank * 8 + kingTargetFile)}${promo}`;
}

/**
 * UCI equality that's robust to the dual castling convention: both
 * `e1c1` (king-target) and `e1a1` (king-on-rook) compare equal when they
 * describe the same castling move in `chess`.
 */
export function sameMove(chess: Chess, a: string, b: string): boolean {
  if (a === b) return true;
  return normalizeCastleUci(chess, a) === normalizeCastleUci(chess, b);
}

export function lineToSan(moves: string[]): string[] {
  const c = chessFromFen(START_FEN);
  const out: string[] = [];
  for (const uci of moves) {
    const m = parseUci(uci);
    if (!m) {
      out.push(uci);
      continue;
    }
    out.push(makeSanAndPlay(c, m));
  }
  return out;
}

export function uciToSanAt(fen: string, uci: string): string {
  const chess = chessFromFen(fen);
  const m = parseUci(uci);
  if (!m) return uci;
  return makeSanAndPlay(chess, m);
}

/**
 * Canonical key for a chess position, ignoring move counters. Keeps the
 * fields that actually distinguish positions (board, side to move, castling
 * rights, en passant target) and drops the halfmove/fullmove clocks — those
 * depend on the move order, not on the resulting position. Two transposing
 * paths that reach the same setup share the same position key.
 */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}
