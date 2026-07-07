import { Chess } from 'chessops/chess';
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { makeSquare, makeUci, parseUci, parseSquare } from 'chessops/util';
import { makeSanAndPlay, parseSan } from 'chessops/san';
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
 * e8c8/e8g8). All other UCIs are passed through unchanged. Everything the
 * app persists should go through this so stored moves compare with `===`.
 */
export function normalizeCastleUci(chess: Chess, uci: string): string {
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

/**
 * Convert a sequence of UCI moves to SAN. `startFen` is the position the
 * sequence is anchored on — defaults to the standard initial position, but
 * Lichess study chapters that begin past the opening (custom `[FEN …]`
 * header) need to pass the chapter's `startFen`, otherwise chessops returns
 * `--` placeholders for any move that isn't legal from the initial board.
 */
export function lineToSan(
  moves: string[],
  startFen: string = START_FEN,
): string[] {
  const c = chessFromFen(startFen);
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

/**
 * Parse a SAN sequence (e.g. a real game's moves) into UCIs, stopping at the
 * first unparsable move or at `maxPlies`. Castling comes out in chessops'
 * king-on-rook form — compare through `sameMove`, not `===`.
 */
export function sansToUcis(
  sans: string[],
  startFen: string = START_FEN,
  maxPlies = Infinity,
): string[] {
  const c = chessFromFen(startFen);
  const out: string[] = [];
  for (const san of sans) {
    if (out.length >= maxPlies) break;
    const m = parseSan(c, san);
    if (!m) break;
    out.push(makeUci(m));
    c.play(m);
  }
  return out;
}

export function uciToSanAt(fen: string, uci: string): string {
  const chess = chessFromFen(fen);
  const m = parseUci(uci);
  if (!m) return uci;
  return makeSanAndPlay(chess, m);
}

/** `3.` / `3…` label of the move played at `ply` (standard-start games). */
export const moveNumberLabel = (ply: number): string =>
  `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;

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
