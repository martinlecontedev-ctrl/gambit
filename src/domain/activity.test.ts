import { describe, it, expect } from 'vitest';
import {
  activityByDay,
  localDate,
  reviewsToday,
  shiftDay,
  streaks,
} from './activity';
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

describe('shiftDay', () => {
  it('walks across month boundaries', () => {
    expect(shiftDay(localDate(at(2026, 6, 1)), -1)).toBe(localDate(at(2026, 5, 30)));
    expect(shiftDay(localDate(at(2026, 5, 30)), 1)).toBe(localDate(at(2026, 6, 1)));
  });
});

describe('activityByDay', () => {
  it('buckets distinct successful cards per day, ignoring failures', () => {
    const reviews = [
      ev({ cardId: 'a', ts: at(2026, 5, 21, 9) }),
      ev({ cardId: 'a', ts: at(2026, 5, 21, 18) }), // same card, same day: once
      ev({ cardId: 'b', ts: at(2026, 5, 21) }),
      ev({ cardId: 'c', ts: at(2026, 5, 21), grade: 0 }), // failure: ignored
      ev({ cardId: 'a', ts: at(2026, 5, 22) }), // same card, next day: counts
    ];
    const byDay = activityByDay(reviews);
    expect(byDay.get(localDate(at(2026, 5, 21)))).toBe(2);
    expect(byDay.get(localDate(at(2026, 5, 22)))).toBe(1);
  });
});

describe('streaks', () => {
  // NOW is June 22 2026, local midday.
  it('counts consecutive days ending today', () => {
    const reviews = [
      ev({ cardId: 'a', ts: at(2026, 5, 20) }),
      ev({ cardId: 'a', ts: at(2026, 5, 21) }),
      ev({ cardId: 'a', ts: at(2026, 5, 22) }),
    ];
    expect(streaks(reviews, NOW)).toEqual({ current: 3, best: 3, todayDone: true });
  });

  it('keeps the streak pending (not broken) when today has no review yet', () => {
    const reviews = [
      ev({ cardId: 'a', ts: at(2026, 5, 20) }),
      ev({ cardId: 'a', ts: at(2026, 5, 21) }),
    ];
    expect(streaks(reviews, NOW)).toEqual({ current: 2, best: 2, todayDone: false });
  });

  it('breaks the current streak on a gap but remembers the best run', () => {
    const reviews = [
      // A 3-day run two weeks ago…
      ev({ cardId: 'a', ts: at(2026, 5, 8) }),
      ev({ cardId: 'a', ts: at(2026, 5, 9) }),
      ev({ cardId: 'a', ts: at(2026, 5, 10) }),
      // …then only today.
      ev({ cardId: 'a', ts: at(2026, 5, 22) }),
    ];
    expect(streaks(reviews, NOW)).toEqual({ current: 1, best: 3, todayDone: true });
  });

  it('ignores failed reviews entirely', () => {
    const reviews = [ev({ cardId: 'a', ts: at(2026, 5, 22), grade: 2 })];
    expect(streaks(reviews, NOW)).toEqual({ current: 0, best: 0, todayDone: false });
  });

  it('is empty on an empty log', () => {
    expect(streaks([], NOW)).toEqual({ current: 0, best: 0, todayDone: false });
  });
});
