import { useStrings } from './index';

/** Strings for the shared opening components (board nav, chapter modal,
 * explorer panel, recognition bar, selected-line view, not-found fallback). */
const fr = {
  boardNav: {
    start: 'Début',
    end: 'Fin',
    prevMove: 'Coup précédent',
    nextMove: 'Coup suivant',
    scrub: 'Naviguer dans la ligne',
  },
  chapterModal: {
    title: 'Nouveau chapitre',
    forcedHelp:
      'Tu joues un coup différent sur ta couleur. Donne un nom au chapitre qui va porter cette variante — la révision saura ainsi quelle théorie tu veux driller.',
    emptyHelp: 'Crée un chapitre vide pour ranger une nouvelle ligne.',
    placeholder: 'Ex. Najdorf — Anglaise',
    create: 'Créer le chapitre',
  },
  explorer: {
    title: 'Explorateur',
    disable: 'Désactiver l’explorateur',
    enable: 'Activer (interroge l’API publique de Lichess)',
    blurb:
      'Coups les plus joués et résultats associés (parties Lichess 1800+ ou parties de maîtres), pour la position affichée.',
    sessionExpired: 'Session Lichess expirée ou révoquée — reconnecte ton compte.',
    needsAccount:
      "L'explorateur passe par ton compte Lichess (gratuit, aucun scope demandé).",
    connect: 'Connecter mon compte Lichess',
    unavailable: 'Explorateur indisponible.',
    rateLimited: "Limite de l'API atteinte — l'explorateur se met en pause une minute.",
    loading: 'Chargement…',
    noGames: 'Aucune partie dans cette base pour cette position.',
    games: (n: string) => `${n} parties`,
    rowTitle: (games: string, w: number, d: number, b: number) =>
      `${games} parties · Blancs ${w}% · Nulles ${d}% · Noirs ${b}%`,
  },
  recognition: {
    noOpening: "Pas d'ouverture reconnue",
    searchYoutube: (query: string) => `Rechercher "${query}" sur YouTube`,
  },
  lineView: {
    initialPosition: '(position initiale — jouez un coup)',
    switchToVariant: (san: string) => `Basculer sur la variante ${san}`,
  },
  notFound: {
    body: 'Ouverture introuvable.',
    back: 'Retour',
  },
};

const en: typeof fr = {
  boardNav: {
    start: 'Start',
    end: 'End',
    prevMove: 'Previous move',
    nextMove: 'Next move',
    scrub: 'Scrub through the line',
  },
  chapterModal: {
    title: 'New chapter',
    forcedHelp:
      'You are playing a different move for your colour. Name the chapter that will carry this variation — review will then know which theory you want to drill.',
    emptyHelp: 'Create an empty chapter to file a new line.',
    placeholder: 'e.g. Najdorf — English Attack',
    create: 'Create chapter',
  },
  explorer: {
    title: 'Explorer',
    disable: 'Turn off the explorer',
    enable: 'Turn on (queries the public Lichess API)',
    blurb:
      'Most played moves and their results (Lichess 1800+ games or master games), for the displayed position.',
    sessionExpired: 'Lichess session expired or revoked — reconnect your account.',
    needsAccount:
      'The explorer goes through your Lichess account (free, no scope requested).',
    connect: 'Connect my Lichess account',
    unavailable: 'Explorer unavailable.',
    rateLimited: 'API limit reached — the explorer pauses for a minute.',
    loading: 'Loading…',
    noGames: 'No games in this database for this position.',
    games: (n: string) => `${n} games`,
    rowTitle: (games: string, w: number, d: number, b: number) =>
      `${games} games · White ${w}% · Draws ${d}% · Black ${b}%`,
  },
  recognition: {
    noOpening: 'No opening recognized',
    searchYoutube: (query: string) => `Search "${query}" on YouTube`,
  },
  lineView: {
    initialPosition: '(initial position — play a move)',
    switchToVariant: (san: string) => `Switch to the ${san} variation`,
  },
  notFound: {
    body: 'Opening not found.',
    back: 'Back',
  },
};

export const COMPONENTS = { fr, en };

export function useComponentStrings() {
  return useStrings(COMPONENTS);
}
