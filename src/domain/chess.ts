import { Chess } from 'chessops/chess';
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { parseUci, parseSquare } from 'chessops/util';
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
 * opening drills.
 */
export function uciFromMove(chess: Chess, orig: Key, dest: Key): string {
  const sq = parseSquare(orig);
  if (sq !== undefined) {
    const piece = chess.board.get(sq);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) {
      return `${orig}${dest}q`;
    }
  }
  return `${orig}${dest}`;
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
