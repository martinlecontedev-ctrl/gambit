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
  1: 'text-emerald-400',
  2: 'text-red-400',
  3: 'text-emerald-300',
  4: 'text-red-300',
  5: 'text-sky-400',
  6: 'text-amber-400',
};

export const NAG_LABELS: Record<Nag, string> = {
  1: 'Bon coup',
  2: 'Coup faible',
  3: 'Brillant',
  4: 'Gaffe',
  5: 'Intéressant',
  6: 'Douteux',
};

/** Tailwind background classes for the on-square badge overlay. */
export const NAG_BADGE_BG: Record<Nag, string> = {
  1: 'bg-emerald-400',
  2: 'bg-red-400',
  3: 'bg-emerald-300',
  4: 'bg-red-300',
  5: 'bg-sky-400',
  6: 'bg-amber-400',
};

export const NAG_ORDER: Nag[] = [1, 5, 3, 6, 2, 4];
