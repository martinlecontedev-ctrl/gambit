import { describe, it, expect } from 'vitest';
import { newCardStats, review, type Grade } from './srs';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000; // fixed epoch so `due` is deterministic

describe('newCardStats', () => {
  it('starts a card due immediately with default ease', () => {
    const s = newCardStats(T0);
    expect(s).toEqual({ ease: 2.5, interval: 0, reps: 0, due: T0, lapses: 0 });
  });
});

describe('review — successful recall ladder', () => {
  it('schedules 1 day, then 6 days, then interval * ease', () => {
    let s = newCardStats(T0);
    s = review(s, 5, T0); // first pass
    expect(s.interval).toBe(1);
    expect(s.reps).toBe(1);
    expect(s.due).toBe(T0 + 1 * DAY);

    s = review(s, 5, T0); // second pass
    expect(s.interval).toBe(6);
    expect(s.reps).toBe(2);

    const easeBefore = s.ease;
    s = review(s, 5, T0); // third pass: 6 * ease, rounded
    expect(s.interval).toBe(Math.round(6 * easeBefore));
    expect(s.reps).toBe(3);
  });

  it('raises ease on a perfect grade', () => {
    const s = review(newCardStats(T0), 5, T0);
    expect(s.ease).toBeGreaterThan(2.5);
  });

  it('leaves ease roughly flat on a grade of 4', () => {
    const s = review(newCardStats(T0), 4, T0);
    expect(s.ease).toBeCloseTo(2.5, 5);
  });
});

describe('review — lapses', () => {
  it('resets reps, drops interval to 1, and counts the lapse on a failure', () => {
    let s = newCardStats(T0);
    s = review(s, 5, T0);
    s = review(s, 5, T0); // interval now 6, reps 2
    s = review(s, 1, T0); // fail
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(1);
    expect(s.lapses).toBe(1);
    expect(s.due).toBe(T0 + 1 * DAY);
  });

  it('lowers ease on a failure but never below the 1.3 floor', () => {
    let s = { ...newCardStats(T0), ease: 1.3 };
    for (let i = 0; i < 5; i++) s = review(s, 0 as Grade, T0);
    expect(s.ease).toBe(1.3);
  });
});
