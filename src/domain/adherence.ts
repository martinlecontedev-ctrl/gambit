// How well does the user actually FOLLOW an opening, judged by behavior
// rather than isolated positions?
//
// Two mechanisms replace fixed thresholds:
//
// 1. Attribution by deepest-followed opening: every game is walked against
//    EVERY same-color opening separately, and only counts for the one(s) it
//    followed deepest. A Scotch game stops feeding the Italian's report the
//    moment a Scotch repertoire exists.
// 2. Per-position adherence, against the user's own baseline: each decision
//    point records passages vs repertoire-moves-played. A miss at a position
//    the user USUALLY gets right is a memory lapse (drill it); a position
//    where the user NEVER plays the repertoire move is a repertoire/practice
//    disagreement (review it — or change the repertoire). The user's own
//    consistency separates "mistake" from "different opening", no magic
//    threshold needed.

import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import {
  chessFromFen,
  fenOf,
  positionKey,
  sameMove,
  START_FEN,
  turnColor,
  uciToSanAt,
} from './chess';
import { buildRepertoireBook, type RepertoireBook } from './deviation';
import type { Color, Opening } from './types';

type GameLike = {
  sans: string[];
  userColor: Color;
  createdAt: number;
};

type Decision = {
  key: string;
  ply: number;
  matched: boolean;
  playedSan: string;
  expectedUcis: string[];
  expectedSans: string[];
};

type Walk = {
  /** Plies played while still inside the book. */
  depth: number;
  exit: 'user' | 'opponent' | 'held';
  decisions: Decision[];
};

/** Walk one game through one opening's own book, recording every user
 * decision taken while still in book (including the one that leaves it). */
function walkGame(sans: string[], userColor: Color, book: RepertoireBook): Walk {
  let chess = chessFromFen(START_FEN);
  let ply = 0;
  const decisions: Decision[] = [];
  for (const san of sans) {
    const fen = fenOf(chess);
    const key = positionKey(fen);
    const expected = book.get(key);
    if (!expected || expected.length === 0) {
      return { depth: ply, exit: 'held', decisions };
    }
    const move = parseSan(chess, san);
    if (!move) return { depth: ply, exit: 'held', decisions };
    const uci = makeUci(move);
    const matched = expected.some(e => sameMove(chess, e, uci));
    const isUser = turnColor(chess) === userColor;
    if (isUser) {
      decisions.push({
        key,
        ply,
        matched,
        playedSan: san,
        expectedUcis: [...expected],
        expectedSans: expected.map(e => uciToSanAt(fen, e)),
      });
    }
    if (!matched) {
      return { depth: ply, exit: isUser ? 'user' : 'opponent', decisions };
    }
    const next = chess.clone();
    next.play(move);
    chess = next;
    ply++;
  }
  return { depth: ply, exit: 'held', decisions };
}

export type LeakPosition = {
  key: string;
  ply: number;
  expectedSans: string[];
  /** Times the position came up in attributed games. */
  seen: number;
  /** Times the repertoire move was played there. */
  followed: number;
  /** Most played wrong move (SAN) and its count. */
  missSan: string;
  missCount: number;
};

export type AdherenceReport = {
  games: number;
  decisions: number;
  followed: number;
  userExits: number;
  opponentExits: number;
  held: number;
  /** Positions with at least one miss, most frequent first. */
  leaks: LeakPosition[];
};

/** A game must stay in book at least this long to be attributed at all —
 * one shared ply says nothing. */
const MIN_ENGAGED_PLIES = 2;

/**
 * Adherence report for `openingId`, over games attributed to it (deepest
 * followed among all same-color openings; ties count for every tied one).
 * Returns null when no game qualifies.
 */
export function buildAdherenceReport(
  games: GameLike[],
  openings: Opening[],
  openingId: string,
): AdherenceReport | null {
  const target = openings.find(o => o.id === openingId);
  if (!target) return null;
  const rivals = openings.filter(o => o.color === target.color);
  const books = new Map(
    rivals.map(o => [o.id, buildRepertoireBook([o], o.color)]),
  );
  const targetBook = books.get(openingId);
  if (!targetBook || targetBook.size === 0) return null;

  const report: AdherenceReport = {
    games: 0,
    decisions: 0,
    followed: 0,
    userExits: 0,
    opponentExits: 0,
    held: 0,
    leaks: [],
  };
  type Agg = {
    key: string;
    ply: number;
    expectedSans: string[];
    seen: number;
    followed: number;
    misses: Map<string, number>;
  };
  const byPosition = new Map<string, Agg>();

  for (const game of games) {
    if (game.userColor !== target.color) continue;
    const targetWalk = walkGame(game.sans, game.userColor, targetBook);
    if (targetWalk.depth < MIN_ENGAGED_PLIES) continue;
    // Attribution: skip if another opening followed this game deeper.
    let deepest = targetWalk.depth;
    for (const [id, book] of books) {
      if (id === openingId) continue;
      const d = walkGame(game.sans, game.userColor, book).depth;
      if (d > deepest) {
        deepest = d;
        break;
      }
    }
    if (deepest > targetWalk.depth) continue;

    report.games++;
    if (targetWalk.exit === 'user') report.userExits++;
    else if (targetWalk.exit === 'opponent') report.opponentExits++;
    else report.held++;
    for (const d of targetWalk.decisions) {
      report.decisions++;
      if (d.matched) report.followed++;
      let agg = byPosition.get(d.key);
      if (!agg) {
        agg = {
          key: d.key,
          ply: d.ply,
          expectedSans: d.expectedSans,
          seen: 0,
          followed: 0,
          misses: new Map(),
        };
        byPosition.set(d.key, agg);
      }
      agg.seen++;
      if (d.matched) agg.followed++;
      else agg.misses.set(d.playedSan, (agg.misses.get(d.playedSan) ?? 0) + 1);
    }
  }

  if (report.games === 0) return null;

  for (const agg of byPosition.values()) {
    let missSan = '';
    let missCount = 0;
    let missTotal = 0;
    for (const [san, count] of agg.misses) {
      missTotal += count;
      if (count > missCount) {
        missCount = count;
        missSan = san;
      }
    }
    if (missTotal === 0) continue;
    report.leaks.push({
      key: agg.key,
      ply: agg.ply,
      expectedSans: agg.expectedSans,
      seen: agg.seen,
      followed: agg.followed,
      missSan,
      missCount: missTotal,
    });
  }
  report.leaks.sort((a, b) => b.missCount - a.missCount || a.ply - b.ply);
  return report;
}
