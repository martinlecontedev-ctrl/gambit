import { describe, it, expect } from 'vitest';
import { localDate, reviewsToday } from './activity';
import type { ReviewEvent } from './types';

// Anchor "now" at local midday so day-bucketing is unambiguous in any timezone.
const NOW = new Date(2026, 5, 22, 12, 0, 0).getTime();
const at = (y: number, mo: number, d: number, h = 12) =>
  new Date(y, mo, d, h, 0, 0).getTime();

const ev = (over: Partial<ReviewEvent> & Pick<ReviewEvent, 'cardId' | 'ts'>): ReviewEvent => ({
  openingId: 'op1',
  grade: 5,
  ...over,
});

describe('localDate', () => {
  it('buckets two instants on the same local day to the same key', () => {
    expect(localDate(at(2026, 5, 22, 1))).toBe(localDate(at(2026, 5, 22, 23)));
  });
  it('separates different days', () => {
    expect(localDate(at(2026, 5, 22))).not.toBe(localDate(at(2026, 5, 21)));
  });
});

describe('reviewsToday', () => {
  it('counts distinct successful moves reviewed today', () => {
    const reviews = [
      ev({ cardId: 'a', ts: at(2026, 5, 22, 9) }),
      ev({ cardId: 'b', ts: at(2026, 5, 22, 10) }),
    ];
    expect(reviewsToday(reviews, NOW)).toBe(2);
  });

  it('counts a move reviewed twice today only once', () => {
    const reviews = [
      ev({ cardId: 'a', ts: at(2026, 5, 22, 9) }),
      ev({ cardId: 'a', ts: at(2026, 5, 22, 18) }),
    ];
    expect(reviewsToday(reviews, NOW)).toBe(1);
  });

  it('ignores failures (grade below 3)', () => {
    const reviews = [
      ev({ cardId: 'a', ts: at(2026, 5, 22, 9), grade: 0 }),
      ev({ cardId: 'b', ts: at(2026, 5, 22, 9), grade: 2 }),
      ev({ cardId: 'c', ts: at(2026, 5, 22, 9), grade: 3 }),
    ];
    expect(reviewsToday(reviews, NOW)).toBe(1); // only c (grade 3) passes
  });

  it('counts a move that was failed then passed the same day once', () => {
    const reviews = [
      ev({ cardId: 'a', ts: at(2026, 5, 22, 9), grade: 1 }),
      ev({ cardId: 'a', ts: at(2026, 5, 22, 10), grade: 4 }),
    ];
    expect(reviewsToday(reviews, NOW)).toBe(1);
  });

  it('ignores reviews from other days', () => {
    const reviews = [
      ev({ cardId: 'a', ts: at(2026, 5, 21) }), // yesterday
      ev({ cardId: 'b', ts: at(2026, 5, 23) }), // tomorrow
      ev({ cardId: 'c', ts: at(2026, 5, 22, 8) }), // today
    ];
    expect(reviewsToday(reviews, NOW)).toBe(1);
  });

  it('is zero with no reviews', () => {
    expect(reviewsToday([], NOW)).toBe(0);
  });
});
