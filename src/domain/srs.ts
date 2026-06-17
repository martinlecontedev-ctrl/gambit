import type { CardStats } from './types';

export const DAY_MS = 86_400_000;

export const newCardStats = (now = Date.now()): CardStats => ({
  ease: 2.5,
  interval: 0,
  reps: 0,
  due: now,
  lapses: 0,
});

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export function review(stats: CardStats, grade: Grade, now = Date.now()): CardStats {
  let { ease, interval, reps, lapses } = stats;
  if (grade < 3) {
    reps = 0;
    interval = 1;
    lapses += 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  return { ease, interval, reps, lapses, due: now + interval * DAY_MS };
}
