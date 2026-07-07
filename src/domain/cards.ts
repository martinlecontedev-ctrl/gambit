import type { Chess } from 'chessops/chess';
import {
  applyUci,
  chessFromFen,
  fenOf,
  positionKey,
  sameMove,
  START_FEN,
  turnColor,
} from './chess';
import { newCardStats } from './srs';
import { buildPrefixTrie, type TrieNode } from './tree';
import type { Card, CardStats, Opening } from './types';

/** Interval (days) at which a card is considered "mastered" — the classic
 * SM-2 mature-card threshold. A move stops counting as in-progress once it
 * survives ~3 weeks of recall. */
export const MASTERY_INTERVAL_DAYS = 21;

export function cardIdFor(
  openingId: string,
  chapterId: string,
  fen: string,
  expectedUci: string,
): string {
  // Chapter is part of the key so two chapters that diverge on one of the
  // user's own moves stay as separate SRS entries — required to learn
  // alternative repertoire choices without contradictions during review.
  return `${openingId}::${chapterId}::${positionKey(fen)}::${expectedUci}`;
}

/**
 * Build the card set for an opening — one card per
 * `(chapter, position, expected user move)`. Cards walk the prefix trie of
 * each chapter's lines independently, so the same position appearing in two
 * chapters with different expected user moves produces two distinct cards.
 * Positions never reviewed yet come back as fresh `newCardStats()` cards, so
 * the returned length is the opening's full move count — the right
 * denominator for mastery/progress.
 *
 * `now` stamps the `due` of never-seen positions. Pass the SAME clock used to
 * test "is it due", otherwise a fresh card minted a millisecond after that
 * clock reads as not-yet-due and flickers in and out of the due count.
 */
export function buildCards(
  opening: Opening,
  stored: Card[],
  now: number = Date.now(),
): Card[] {
  const fallbackChapterId = opening.chapters[0]?.id;
  if (!fallbackChapterId) return [];

  // Re-key every stored card to the current `${opening}::${chapter}::${posKey}::${uci}`
  // shape: legacy `lineId/plyIdx` cards locate their chapter via the line they
  // came from; pre-chapter current-shape cards land in the migrated default
  // chapter (which the openings repo guarantees exists before this runs).
  const byId = new Map<string, Card>();
  for (const raw of stored as unknown[]) {
    if (isLegacyCardShape(raw)) {
      const migrated = migrateLegacyCard(raw, opening);
      if (!migrated) continue;
      const existing = byId.get(migrated.id);
      if (!existing || migrated.reps > existing.reps) byId.set(migrated.id, migrated);
    } else if (isCurrentCardShape(raw)) {
      const chapterId =
        typeof raw.chapterId === 'string' && raw.chapterId.length > 0
          ? raw.chapterId
          : fallbackChapterId;
      const newId = cardIdFor(raw.openingId, chapterId, raw.fen, raw.expectedUci);
      const updated: Card =
        newId !== raw.id || raw.chapterId !== chapterId
          ? { ...raw, id: newId, chapterId }
          : raw;
      const existing = byId.get(newId);
      if (!existing || updated.reps > existing.reps) byId.set(newId, updated);
    }
  }

  const out: Card[] = [];

  for (const chapter of opening.chapters) {
    // Review is opt-in per chapter: disabled chapters emit no cards at all
    // (not due, not in the mastery denominator). Their stored stats survive.
    if (!chapter.reviewEnabled) continue;
    const chapterLines = opening.lines.filter(l => l.chapterId === chapter.id);
    if (chapterLines.length === 0) continue;
    const trie = buildPrefixTrie(chapterLines);
    const seen = new Set<string>();
    const startFen = chapter.startFen ?? START_FEN;
    const startChess = chessFromFen(startFen);
    // The user-turn parity depends on whose move it is at the chapter's
    // starting position — a chapter that starts with black to move flips
    // every depth-vs-side relationship.
    const userTurnParity = turnColor(startChess) === opening.color ? 0 : 1;

    // Review windows, keyed by line. A move at ply `depth` is drilled when at
    // least ONE line playing it there covers that ply — union semantics, so a
    // prefix shared with a variant stays drilled as long as any branch wants it.
    const rangesByLine = new Map<string, { start: number; end?: number }[]>();
    for (const l of chapterLines) {
      if (l.reviewRanges) rangesByLine.set(l.id, l.reviewRanges);
    }
    const plyCovered = (lineIds: Set<string>, ply: number): boolean => {
      for (const id of lineIds) {
        const rs = rangesByLine.get(id);
        if (!rs) return true;
        for (const r of rs) {
          if (ply >= r.start && (r.end === undefined || ply < r.end)) return true;
        }
      }
      return false;
    };

    const walk = (
      node: TrieNode,
      depth: number,
      chess: Chess,
      lastUci: string | undefined,
    ) => {
      if (depth % 2 === userTurnParity) {
        const fen = fenOf(chess);
        for (const [uci, child] of node.children) {
          if (!plyCovered(child.lineIds, depth)) continue;
          const id = cardIdFor(opening.id, chapter.id, fen, uci);
          if (seen.has(id)) continue;
          seen.add(id);
          const base =
            byId.get(id) ?? {
              ...newCardStats(now),
              id,
              openingId: opening.id,
              chapterId: chapter.id,
              fen,
              expectedUci: uci,
            };
          // `lastUci` is the move that reached this position — the opponent's
          // last move at a user-turn node. Always recomputed from the line, so
          // it overrides any stale value merged from storage.
          out.push({ ...base, lastMove: lastUci });
        }
      }
      for (const [uci, child] of node.children) {
        walk(child, depth + 1, applyUci(chess, uci), uci);
      }
    };

    walk(trie, 0, startChess, undefined);
  }

  return out;
}

const plyInRanges = (
  ranges: { start: number; end?: number }[],
  ply: number,
): boolean =>
  ranges.some(r => ply >= r.start && (r.end === undefined || ply < r.end));

/** Sort + merge intervals; an open-ended one swallows everything after it. */
function mergeRanges(
  ranges: { start: number; end?: number }[],
): { start: number; end?: number }[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: { start: number; end?: number }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && (last.end === undefined || r.start <= last.end)) {
      if (last.end !== undefined) {
        last.end = r.end === undefined ? undefined : Math.max(last.end, r.end);
      }
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/**
 * Widen review windows so `card`'s move is back in the regular rotation:
 * every line of the card's chapter that plays `expectedUci` on the card's
 * position gets that ply folded into its `reviewRanges`. Lines without
 * stored ranges are already fully covered and stay untouched. Returns the
 * same opening object when nothing needed widening.
 */
export function coverCardInReviewRanges(opening: Opening, card: Card): Opening {
  const chapter = opening.chapters.find(c => c.id === card.chapterId);
  if (!chapter) return opening;
  const key = positionKey(card.fen);
  let changed = false;
  const lines = opening.lines.map(line => {
    if (line.chapterId !== card.chapterId || !line.reviewRanges) return line;
    let ranges = line.reviewRanges;
    let chess = chessFromFen(chapter.startFen ?? START_FEN);
    for (let i = 0; i < line.moves.length; i++) {
      if (
        positionKey(fenOf(chess)) === key &&
        sameMove(chess, line.moves[i], card.expectedUci) &&
        !plyInRanges(ranges, i)
      ) {
        ranges = mergeRanges([...ranges, { start: i, end: i + 1 }]);
      }
      chess = applyUci(chess, line.moves[i]);
    }
    if (ranges === line.reviewRanges) return line;
    changed = true;
    return { ...line, reviewRanges: ranges };
  });
  return changed ? { ...opening, lines } : opening;
}

/** The home card's master switch state: ON as soon as one chapter reviews. */
export function openingReviewOn(opening: Opening): boolean {
  return opening.chapters.some(c => c.reviewEnabled);
}

/** Flip the whole opening in one gesture: every chapter follows. Chapter
 * switches on the overview refine afterwards. */
export function withOpeningReview(opening: Opening, on: boolean): Opening {
  return {
    ...opening,
    chapters: opening.chapters.map(c => ({ ...c, reviewEnabled: on })),
  };
}

export function withChapterReview(
  opening: Opening,
  chapterId: string,
  on: boolean,
): Opening {
  return {
    ...opening,
    chapters: opening.chapters.map(c =>
      c.id === chapterId ? { ...c, reviewEnabled: on } : c,
    ),
  };
}

export type OpeningStats = {
  /** Every move the user must know in this opening. */
  total: number;
  /** Moves whose interval cleared `MASTERY_INTERVAL_DAYS`. */
  mastered: number;
  /** Moves due for review at `now`. */
  due: number;
};

/** Aggregate mastery/due counts for an opening's full card set. */
export function openingStats(
  opening: Opening,
  stored: Card[],
  now: number,
): OpeningStats {
  const cards = buildCards(opening, stored, now);
  let mastered = 0;
  let due = 0;
  for (const c of cards) {
    if (c.interval >= MASTERY_INTERVAL_DAYS) mastered++;
    if (c.due <= now) due++;
  }
  return { total: cards.length, mastered, due };
}

type LegacyCardShape = CardStats & {
  id: string;
  openingId: string;
  lineId: string;
  plyIdx: number;
};

function isLegacyCardShape(c: unknown): c is LegacyCardShape {
  return typeof c === 'object' && c !== null && 'lineId' in c && 'plyIdx' in c;
}

type CurrentCardLike = Card & { chapterId?: string };

function isCurrentCardShape(c: unknown): c is CurrentCardLike {
  return typeof c === 'object' && c !== null && 'fen' in c && 'expectedUci' in c;
}

function migrateLegacyCard(c: LegacyCardShape, opening: Opening): Card | undefined {
  const line = opening.lines.find(l => l.id === c.lineId);
  if (!line || c.plyIdx >= line.moves.length) return undefined;
  const chapter = opening.chapters.find(ch => ch.id === line.chapterId);
  let chess = chessFromFen(chapter?.startFen ?? START_FEN);
  for (let i = 0; i < c.plyIdx; i++) chess = applyUci(chess, line.moves[i]);
  const fen = fenOf(chess);
  const expectedUci = line.moves[c.plyIdx];
  return {
    ease: c.ease,
    interval: c.interval,
    reps: c.reps,
    due: c.due,
    lapses: c.lapses,
    id: cardIdFor(opening.id, line.chapterId, fen, expectedUci),
    openingId: c.openingId,
    chapterId: line.chapterId,
    fen,
    expectedUci,
  };
}
