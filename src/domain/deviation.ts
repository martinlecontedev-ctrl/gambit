// Compare real games against the repertoire: where did the user (or the
// opponent) leave book? The "book" is every position reached by any line of
// any opening of the given color, keyed by canonical position key — so
// transpositions and custom-start chapters match wherever the game actually
// lands in known territory.

import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import {
  applyUci,
  chessFromFen,
  fenOf,
  positionKey,
  sameMove,
  START_FEN,
  turnColor,
  uciToSanAt,
} from './chess';
import { buildPrefixTrie, type TrieNode } from './tree';
import type { Color, Opening } from './types';

/** Every continuation the repertoire knows, keyed by position. Both sides'
 * moves are stored: the user's expected replies AND the opponent moves the
 * repertoire prepares against. */
export type RepertoireBook = Map<string, string[]>;

/** Visit every position of every chapter of `opening` that still has
 * continuations, with the UCI moves stored there. */
function forEachBookPosition(
  opening: Opening,
  visit: (key: string, ucis: Iterable<string>) => void,
): void {
  for (const chapter of opening.chapters) {
    const lines = opening.lines.filter(l => l.chapterId === chapter.id);
    if (lines.length === 0) continue;
    const walk = (node: TrieNode, fen: string) => {
      if (node.children.size > 0) {
        visit(positionKey(fen), node.children.keys());
      }
      for (const [uci, child] of node.children) {
        walk(child, fenOf(applyUci(chessFromFen(fen), uci)));
      }
    };
    walk(buildPrefixTrie(lines), chapter.startFen ?? START_FEN);
  }
}

export function buildRepertoireBook(
  openings: Opening[],
  color: Color,
): RepertoireBook {
  const book: RepertoireBook = new Map();
  for (const opening of openings) {
    if (opening.color !== color) continue;
    forEachBookPosition(opening, (key, ucis) => {
      const arr = book.get(key) ?? [];
      for (const uci of ucis) {
        if (!arr.includes(uci)) arr.push(uci);
      }
      book.set(key, arr);
    });
  }
  return book;
}

/** First opening (in list order) holding each position — used to route a
 * "drill this missed move" deep link to a concrete opening. */
export function buildPositionOwners(
  openings: Opening[],
  color: Color,
): Map<string, string> {
  const owners = new Map<string, string>();
  for (const opening of openings) {
    if (opening.color !== color) continue;
    forEachBookPosition(opening, key => {
      if (!owners.has(key)) owners.set(key, opening.id);
    });
  }
  return owners;
}

/**
 * Locate a line that plays exactly `path` (repertoire spelling) from the
 * standard start — the anchor for grafting an opponent novelty seen in a
 * real game. Custom-start chapters are skipped: a game path is indexed from
 * the initial position, their lines are not. `undefined` when the game
 * reached the position only via a transposition the repertoire spells
 * differently.
 */
export function findLineForPath(
  openings: Opening[],
  color: Color,
  path: string[],
): { openingId: string; lineId: string } | undefined {
  for (const opening of openings) {
    if (opening.color !== color) continue;
    const standardChapters = new Set(
      opening.chapters.filter(c => !c.startFen).map(c => c.id),
    );
    for (const line of opening.lines) {
      if (!standardChapters.has(line.chapterId)) continue;
      if (line.moves.length < path.length) continue;
      if (path.every((m, i) => line.moves[i] === m)) {
        return { openingId: opening.id, lineId: line.id };
      }
    }
  }
  return undefined;
}

export type DeviationVerdict =
  /** No opening of this color in the repertoire at all. */
  | { kind: 'no-repertoire' }
  /** The user played a move the repertoire doesn't hold. The actionable one.
   * `key` is the position to drill (before the wrong move); `expected` /
   * `expectedUcis` are the repertoire replies (SAN / UCI, same order). */
  | {
      kind: 'user-left';
      ply: number;
      played: string;
      playedUci: string;
      expected: string[];
      expectedUcis: string[];
      key: string;
    }
  /** The opponent left the user's preparation — nothing to fix, but a
   * candidate line to add. `path` is the in-book move sequence up to the
   * novelty, in the repertoire's own UCI spelling (castles normalized), so
   * it prefix-matches stored lines; `playedUci` is the novelty itself. */
  | {
      kind: 'opponent-left';
      ply: number;
      played: string;
      playedUci: string;
      expected: string[];
      expectedUcis: string[];
      key: string;
      path: string[];
    }
  /** Stayed in book until the repertoire (or the game) ran out.
   * `ply === 0` means the game never entered the repertoire. */
  | { kind: 'book-end'; ply: number };

/**
 * Walk a game (SAN list) through the book and report where it left.
 * Castling notation is normalized through `sameMove`, so a repertoire
 * `e1g1` matches chessops' king-on-rook `e1h1` for `O-O`.
 */
export function analyzeGame(
  sans: string[],
  userColor: Color,
  book: RepertoireBook,
): DeviationVerdict {
  if (book.size === 0) return { kind: 'no-repertoire' };
  let chess = chessFromFen(START_FEN);
  let ply = 0;
  const path: string[] = [];
  for (const san of sans) {
    const fen = fenOf(chess);
    const key = positionKey(fen);
    const expected = book.get(key);
    if (!expected || expected.length === 0) return { kind: 'book-end', ply };
    const move = parseSan(chess, san);
    if (!move) return { kind: 'book-end', ply };
    const uci = makeUci(move);
    const matched = expected.find(e => sameMove(chess, e, uci));
    if (matched === undefined) {
      const expectedSans = expected.map(e => uciToSanAt(fen, e));
      if (turnColor(chess) === userColor) {
        return {
          kind: 'user-left',
          ply,
          played: san,
          playedUci: uci,
          expected: expectedSans,
          expectedUcis: [...expected],
          key,
        };
      }
      return {
        kind: 'opponent-left',
        ply,
        played: san,
        playedUci: uci,
        expected: expectedSans,
        expectedUcis: [...expected],
        key,
        path,
      };
    }
    path.push(matched);
    const next = chess.clone();
    next.play(move);
    chess = next;
    ply++;
  }
  return { kind: 'book-end', ply };
}
