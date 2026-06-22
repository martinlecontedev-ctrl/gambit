import { describe, it, expect } from 'vitest';
import { buildCards, openingStats, MASTERY_INTERVAL_DAYS } from './cards';
import { applyUci, chessFromFen, fenOf, START_FEN } from './chess';
import { newCardStats } from './srs';
import type { Card, Opening } from './types';

const CH = 'ch1';

// A white repertoire: 1.e4 e5 2.Nf3. The user plays White, so only the
// white-to-move positions are cards: the start (→ e2e4) and after 1.e4 e5
// (→ g1f3). Black's 1...e5 is not a user move. Expected total = 2.
const opening: Opening = {
  id: 'op1',
  name: 'Test',
  color: 'white',
  chapters: [{ id: CH, name: 'Principal', order: 0 }],
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
