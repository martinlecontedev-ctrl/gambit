import type { Nag } from '../domain/types';
import { useStrings } from './index';

/**
 * Strings shared across areas: top nav, 404, generic buttons, NAG labels.
 * FROZEN for parallel work — per-page strings belong to the page's own
 * namespace, even at the cost of a duplicate word or two.
 */
const fr = {
  nav: { openings: 'OUVERTURES', lichess: 'LICHESS', guide: 'GUIDE' },
  notFound: {
    body: "Cette page n'existe pas.",
    back: '← Retour aux ouvertures',
  },
  back: '← Retour',
  cancel: 'Annuler',
  close: 'Fermer',
  nagLabels: {
    1: 'Bon coup',
    2: 'Coup faible',
    3: 'Brillant',
    4: 'Gaffe',
    5: 'Intéressant',
    6: 'Douteux',
  } as Record<Nag, string>,
  reviewSwitch: { on: 'Retirer de la révision', off: 'Intégrer à la révision' },
  promotion: {
    pieces: { q: 'Dame', n: 'Cavalier', r: 'Tour', b: 'Fou' },
    promoteTo: (piece: string) => `Promouvoir en ${piece.toLowerCase()}`,
  },
};

const en: typeof fr = {
  nav: { openings: 'OPENINGS', lichess: 'LICHESS', guide: 'GUIDE' },
  notFound: {
    body: 'This page does not exist.',
    back: '← Back to openings',
  },
  back: '← Back',
  cancel: 'Cancel',
  close: 'Close',
  nagLabels: {
    1: 'Good move',
    2: 'Poor move',
    3: 'Brilliant',
    4: 'Blunder',
    5: 'Interesting',
    6: 'Dubious',
  } as Record<Nag, string>,
  reviewSwitch: { on: 'Remove from review', off: 'Include in review' },
  promotion: {
    pieces: { q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' },
    promoteTo: (piece: string) => `Promote to ${piece.toLowerCase()}`,
  },
};

export const COMMON = { fr, en };

export function useCommon() {
  return useStrings(COMMON);
}
