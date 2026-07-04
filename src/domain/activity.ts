import type { ReviewEvent } from './types';

/** A grade of 3 or more is a successful recall in SM-2 (see `srs.review`). */
const PASS_GRADE = 3;

/** Local calendar day as `YYYY-M-D` — stable per local day, used to bucket
 * review events. Not a canonical ISO date. */
export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Number of distinct moves successfully reviewed today. Failures don't count —
 * a missed move isn't "done" and will come back — and a move reviewed more than
 * once in a day (future relearning steps) counts once via the cardId set.
 */
export function reviewsToday(reviews: ReviewEvent[], now: number): number {
  const today = localDate(now);
  const done = new Set<string>();
  for (const r of reviews) {
    if (r.grade >= PASS_GRADE && localDate(r.ts) === today) done.add(r.cardId);
  }
  return done.size;
}

/** The local day `delta` days away from `key`, in `localDate` format. Goes
 * through the Date constructor (not `± 86_400_000 ms`) so DST transitions
 * can't skip or double a calendar day. */
export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + delta).getTime());
}

/**
 * Distinct moves successfully reviewed, bucketed per local day — the same
 * counting rule as `reviewsToday` applied to the whole log. Feeds the
 * activity heatmap, so the today cell always agrees with the banner count.
 */
export function activityByDay(reviews: ReviewEvent[]): Map<string, number> {
  const credited = new Set<string>();
  const byDay = new Map<string, number>();
  for (const r of reviews) {
    if (r.grade < PASS_GRADE) continue;
    const day = localDate(r.ts);
    const once = `${day}|${r.cardId}`;
    if (credited.has(once)) continue;
    credited.add(once);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return byDay;
}

export type Streaks = {
  /** Consecutive active days ending today — or ending yesterday when today
   * has no successful review yet: the streak is pending, not broken, until
   * midnight. */
  current: number;
  /** Longest run of consecutive active days found in the log. */
  best: number;
  /** Whether today already counts toward the streak. */
  todayDone: boolean;
};

export function streaks(reviews: ReviewEvent[], now: number): Streaks {
  const active = new Set<string>();
  for (const r of reviews) {
    if (r.grade >= PASS_GRADE) active.add(localDate(r.ts));
  }
  const today = localDate(now);
  const todayDone = active.has(today);

  let current = 0;
  let cursor = todayDone ? today : shiftDay(today, -1);
  while (active.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }

  // Each run is measured once, from its start day (the one with no active
  // predecessor) — O(n) over active days.
  let best = current;
  for (const day of active) {
    if (active.has(shiftDay(day, -1))) continue;
    let len = 1;
    let next = shiftDay(day, 1);
    while (active.has(next)) {
      len++;
      next = shiftDay(next, 1);
    }
    if (len > best) best = len;
  }
  return { current, best, todayDone };
}
