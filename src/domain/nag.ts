import type { Nag } from './types';

export const NAG_SYMBOLS: Record<Nag, string> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  5: '!?',
  6: '?!',
};

export const NAG_COLORS: Record<Nag, string> = {
  1: 'text-nag-good',
  2: 'text-nag-mistake',
  3: 'text-nag-brilliant',
  4: 'text-nag-blunder',
  5: 'text-nag-interesting',
  6: 'text-nag-dubious',
};

/** Tailwind background classes for the on-square badge overlay. */
export const NAG_BADGE_BG: Record<Nag, string> = {
  1: 'bg-nag-good',
  2: 'bg-nag-mistake',
  3: 'bg-nag-brilliant',
  4: 'bg-nag-blunder',
  5: 'bg-nag-interesting',
  6: 'bg-nag-dubious',
};

export const NAG_ORDER: Nag[] = [1, 5, 3, 6, 2, 4];
