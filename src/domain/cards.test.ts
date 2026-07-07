import { describe, it, expect } from 'vitest';
import {
  buildCards,
  coverCardInReviewRanges,
  openingReviewOn,
  openingStats,
  withChapterReview,
  withOpeningReview,
  MASTERY_INTERVAL_DAYS,
} from './cards';
import { applyUci, chessFromFen, fenOf, START_FEN } from './chess';
import { newCardStats } from './srs';
import type { Card, Opening } from './types';

const CH = 'ch1';

// A white repertoire: 1.e4 e5 2.Nf3. The user plays White, so only the
// white-to-move positions are cards: the start (→ e2e4) and after 1.e4 e5
// (→ g1f3). Black's 1...e5 is not a user move. Expected total = 2.
// Review is opt-in per chapter, so the fixture enables it explicitly.
const opening: Opening = {
  id: 'op1',
  name: 'Test',
  color: 'white',
  chapters: [{ id: CH, name: 'Principal', order: 0, reviewEnabled: true }],
  lines: [{ id: 'l1', name: 'main', chapterId: CH, moves: ['e2e4', 'e7e5', 'g1f3'] }],
  createdAt: 0,
  updatedAt: 0,
};

const fenAfter = (ucis: string[]): string => {
  let c = chessFromFen(START_FEN);
  for (const u of ucis) c = applyUci(c, u);
  return fenOf(c);
};

const storedCard = (fen: string, expectedUci: string, over: Partial<Card>): Card => ({
  ...newCardStats(0),
  id: 'irrelevant', // buildCards re-keys by (opening, chapter, posKey, uci)
  openingId: opening.id,
  chapterId: CH,
  fen,
  expectedUci,
  ...over,
});

describe('buildCards', () => {
  it('emits one card per user-turn position, ignoring the opponent move', () => {
    const cards = buildCards(opening, []);
    expect(cards).toHaveLength(2);
    expect(cards.map(c => c.expectedUci).sort()).toEqual(['e2e4', 'g1f3']);
  });

  it('returns nothing when the opening has no chapter', () => {
    expect(buildCards({ ...opening, chapters: [] }, [])).toEqual([]);
  });

  it('emits nothing for chapters not opted into review (default off)', () => {
    const off = {
      ...opening,
      chapters: [{ id: CH, name: 'Principal', order: 0 }],
    };
    expect(buildCards(off, [])).toEqual([]);
    expect(openingStats(off, [], 0)).toEqual({ total: 0, mastered: 0, due: 0 });
  });

  it('re-enabling a chapter brings its stored SRS stats back intact', () => {
    const stored = storedCard(START_FEN, 'e2e4', { reps: 4, interval: 30 });
    const off = withOpeningReview(opening, false);
    expect(buildCards(off, [stored])).toEqual([]);
    const e4 = buildCards(withOpeningReview(off, true), [stored]).find(
      c => c.expectedUci === 'e2e4',
    );
    expect(e4?.reps).toBe(4);
    expect(e4?.interval).toBe(30);
  });

  it('merges stored stats onto the matching position by position key', () => {
    const stored = storedCard(START_FEN, 'e2e4', { reps: 4, interval: 30 });
    const cards = buildCards(opening, [stored]);
    const e4 = cards.find(c => c.expectedUci === 'e2e4');
    expect(e4?.interval).toBe(30);
    expect(e4?.reps).toBe(4);
  });

  it('records the opponent move that led to each card position', () => {
    const cards = buildCards(opening, []);
    const e4 = cards.find(c => c.expectedUci === 'e2e4');
    const nf3 = cards.find(c => c.expectedUci === 'g1f3');
    expect(e4?.lastMove).toBeUndefined(); // start position, nothing precedes
    expect(nf3?.lastMove).toBe('e7e5'); // black's reply is the last move
  });
});

describe('buildCards with review windows', () => {
  const line = opening.lines[0];

  it('drops user moves whose ply falls outside the line windows', () => {
    const o: Opening = {
      ...opening,
      lines: [{ ...line, reviewRanges: [{ start: 2, end: 3 }] }],
    };
    expect(buildCards(o, []).map(c => c.expectedUci)).toEqual(['g1f3']);
  });

  it('treats an absent end as open-ended', () => {
    const o: Opening = {
      ...opening,
      lines: [{ ...line, reviewRanges: [{ start: 2 }] }],
    };
    expect(buildCards(o, []).map(c => c.expectedUci)).toEqual(['g1f3']);
  });

  it('supports non-contiguous coverage across segments', () => {
    const o: Opening = {
      ...opening,
      lines: [{ ...line, reviewRanges: [{ start: 0, end: 1 }, { start: 2 }] }],
    };
    // Both e4 (ply 0) and Nf3 (ply 2) drilled, nothing in between.
    expect(buildCards(o, []).map(c => c.expectedUci).sort()).toEqual([
      'e2e4',
      'g1f3',
    ]);
  });

  it('drills nothing on an empty window list', () => {
    const o: Opening = {
      ...opening,
      lines: [{ ...line, reviewRanges: [] }],
    };
    expect(buildCards(o, [])).toEqual([]);
  });

  it('keeps a shared prefix move as long as one covering line drills it', () => {
    // Main line excludes ply 0; the variant (same prefix, diverging on
    // black's reply) still covers it → union keeps e2e4.
    const variant = {
      id: 'l2',
      name: 'var',
      chapterId: CH,
      parentLineId: 'l1',
      moves: ['e2e4', 'c7c5', 'g1f3'],
    };
    const o: Opening = {
      ...opening,
      lines: [{ ...line, reviewRanges: [{ start: 2 }] }, variant],
    };
    const ucis = buildCards(o, []).map(c => c.expectedUci).sort();
    expect(ucis).toContain('e2e4');
  });

  it('excludes a move only when every covering line excludes it', () => {
    const variant = {
      id: 'l2',
      name: 'var',
      chapterId: CH,
      parentLineId: 'l1',
      moves: ['e2e4', 'c7c5', 'g1f3'],
      reviewRanges: [{ start: 2 }],
    };
    const o: Opening = {
      ...opening,
      lines: [{ ...line, reviewRanges: [{ start: 2 }] }, variant],
    };
    const ucis = buildCards(o, []).map(c => c.expectedUci);
    expect(ucis).not.toContain('e2e4');
    expect(ucis).toHaveLength(2); // Nf3 after 1...e5 and Nf3 after 1...c5
  });

  it('shrinks the mastery denominator along with the window', () => {
    const o: Opening = {
      ...opening,
      lines: [{ ...line, reviewRanges: [{ start: 2 }] }],
    };
    expect(openingStats(o, [], 9_999_999_999_999).total).toBe(1);
  });
});

describe('openingStats', () => {
  // Far future so that fresh cards built by `buildCards` (due = real Date.now())
  // always read as due, keeping the assertions deterministic.
  const now = 9_999_999_999_999;

  it('counts every user move as the mastery denominator', () => {
    expect(openingStats(opening, [], now).total).toBe(2);
  });

  it('treats fresh cards as due and not mastered', () => {
    const s = openingStats(opening, [], now);
    expect(s.due).toBe(2); // fresh card due = Date.now() ≤ now
    expect(s.mastered).toBe(0);
  });

  it('stamps fresh cards with the provided now so due is independent of the wall clock', () => {
    // Regression: fresh cards must be due against the exact `now` passed in,
    // not a `Date.now()` read a moment later. A `now` far in the past would
    // wrongly report 0 due if buildCards minted them with the real clock.
    expect(openingStats(opening, [], 1_000).due).toBe(2);
  });

  it('marks a card mastered at the interval threshold and not before', () => {
    const below = storedCard(START_FEN, 'e2e4', {
      interval: MASTERY_INTERVAL_DAYS - 1,
      due: now + 1,
    });
    const at = storedCard(START_FEN, 'e2e4', {
      interval: MASTERY_INTERVAL_DAYS,
      due: now + 1,
    });
    expect(openingStats(opening, [below], now).mastered).toBe(0);
    expect(openingStats(opening, [at], now).mastered).toBe(1);
  });

  it('excludes cards whose due date is in the future from the due count', () => {
    const future = storedCard(fenAfter(['e2e4', 'e7e5']), 'g1f3', {
      due: now + 86_400_000,
    });
    // Only the still-fresh e2e4 card remains due.
    expect(openingStats(opening, [future], now).due).toBe(1);
  });
});

describe('coverCardInReviewRanges', () => {
  const windowed: Opening = {
    ...opening,
    lines: [
      {
        id: 'l1',
        name: 'main',
        chapterId: CH,
        moves: ['e2e4', 'e7e5', 'g1f3'],
        // Only the first move is drilled: 2.Nf3 (ply 2) is windowed out.
        reviewRanges: [{ start: 0, end: 1 }],
      },
    ],
  };
  const nf3Card = storedCard(fenAfter(['e2e4', 'e7e5']), 'g1f3', {});

  it('folds the card ply back into the line windows', () => {
    // Sanity: the card is not emitted while windowed out.
    expect(buildCards(windowed, []).map(c => c.expectedUci)).toEqual(['e2e4']);
    const covered = coverCardInReviewRanges(windowed, nf3Card);
    expect(covered.lines[0].reviewRanges).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ]);
    expect(buildCards(covered, []).map(c => c.expectedUci).sort()).toEqual([
      'e2e4',
      'g1f3',
    ]);
  });

  it('merges adjacent intervals and leaves covered lines untouched', () => {
    const adjacent: Opening = {
      ...windowed,
      lines: [{ ...windowed.lines[0], reviewRanges: [{ start: 0, end: 2 }] }],
    };
    const merged = coverCardInReviewRanges(adjacent, nf3Card);
    expect(merged.lines[0].reviewRanges).toEqual([{ start: 0, end: 3 }]);
    // Fully covered line (no stored ranges): the same object comes back.
    expect(coverCardInReviewRanges(opening, nf3Card)).toBe(opening);
    // Ply already inside a window: no rewrite either.
    expect(coverCardInReviewRanges(merged, nf3Card)).toBe(merged);
  });

  it('ignores lines of other chapters and unrelated positions', () => {
    const other = storedCard(START_FEN, 'e2e4', { chapterId: 'other' });
    expect(coverCardInReviewRanges(windowed, other)).toBe(windowed);
  });
});

describe('review toggles', () => {
  it('openingReviewOn is true as soon as one chapter reviews', () => {
    const two: Opening = {
      ...opening,
      chapters: [
        { id: CH, name: 'A', order: 0 },
        { id: 'ch2', name: 'B', order: 1, reviewEnabled: true },
      ],
    };
    expect(openingReviewOn(two)).toBe(true);
    expect(openingReviewOn(withOpeningReview(two, false))).toBe(false);
  });

  it('withOpeningReview flips every chapter; withChapterReview only one', () => {
    const two: Opening = {
      ...opening,
      chapters: [
        { id: CH, name: 'A', order: 0 },
        { id: 'ch2', name: 'B', order: 1 },
      ],
    };
    expect(withOpeningReview(two, true).chapters.map(c => c.reviewEnabled)).toEqual([
      true,
      true,
    ]);
    expect(
      withChapterReview(two, 'ch2', true).chapters.map(c => c.reviewEnabled ?? false),
    ).toEqual([false, true]);
  });
});
