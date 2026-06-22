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
