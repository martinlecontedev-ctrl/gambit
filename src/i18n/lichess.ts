import { useStrings } from './index';

const fr = {
  header: {
    connectedAs: (username: string) => `Connecté en tant que ${username}.`,
    tagline: 'Connecte ton compte pour croiser tes parties avec ton répertoire.',
    refresh: 'Actualiser',
    signOut: 'Déconnecter',
  },
  connect: {
    title: 'Connecte ton compte Lichess',
    body: "Tes dernières parties comparées à ton répertoire — où es-tu sorti de la théorie, qu'attendait ta préparation ? — et l'explorateur d'ouvertures sans jeton à coller. OAuth officiel, aucun scope demandé, tout reste stocké en local.",
    button: 'Connecter Lichess',
  },
  speeds: {
    bullet: 'Bullet',
    blitz: 'Blitz',
    rapid: 'Rapide',
    classical: 'Classique',
  } as Record<string, string>,
  results: { win: 'V', draw: 'N', loss: 'D' },
  /** Default names persisted on chapters/lines created from this page —
   * frozen in the creation language, like any user-editable name. */
  defaults: { mainChapter: 'Principal', firstLine: 'Ligne 1', variant: 'Variante' },
  playedOpenings: {
    title: 'Ouvertures jouées',
    white: 'Blancs',
    black: 'Noirs',
    empty: 'Aucune partie reconnue.',
    rowTitle: (games: number, wins: number, draws: number, losses: number) =>
      `${games} partie${games > 1 ? 's' : ''} · ${wins}V ${draws}N ${losses}D`,
    favourite: 'préférée',
    coveredTitle: 'Cette ouverture est couverte par ton répertoire',
    covered: '✓ au répertoire',
    createTitle:
      'Créer un répertoire pour cette ouverture, pré-rempli avec tes coups les plus joués',
    create: 'Créer un répertoire',
    alreadyExists: (name: string) => `Une ouverture nommée « ${name} » existe déjà.`,
  },
  games: {
    title: 'Parties récentes · face au répertoire',
    loadError: 'Impossible de charger les parties — réessaie dans un instant.',
    loading: 'Chargement…',
    empty: 'Aucune partie récente.',
    prev: '← Précédentes',
    next: 'Suivantes →',
    pageInfo: (page: number, pageCount: number, total: number) =>
      `Page ${page} / ${pageCount} · ${total} parties`,
    hideBifurcation: 'Replier la position de bifurcation',
    showBifurcation: 'Voir la position de bifurcation',
    revise: 'Réviser ce coup',
    reviseTitle: 'Session exercice sur la position du coup manqué',
    addLine: 'Ajouter au répertoire',
    addLineTitle: "Créer une variante avec le coup adverse et ouvrir l'éditeur dessus",
    openAtDeviation: 'Ouvrir la partie sur Lichess, à la position de sortie de théorie',
    openGame: 'Ouvrir la partie sur Lichess',
  },
  verdicts: {
    userLeftPlayed: (moveLabel: string) => `Dévié ${moveLabel} : joué`,
    userLeftExpected: ' — rép. :',
    opponentLeft: (moveLabel: string) => `Adversaire sort de la théorie ${moveLabel}`,
  },
  bifurcation: {
    you: 'Toi :',
    opponent: 'Adversaire :',
    repertoire: 'Répertoire :',
    userHint: '« Réviser ce coup » rejoue cette position en exercice.',
    opponentHint: '« Ajouter au répertoire » greffe ce coup comme variante à préparer.',
  },
  sync: {
    title: 'Sauvegarde du répertoire · études privées Lichess',
    pushAll: 'Tout pousser',
    pushing: 'Envoi…',
    authIssue:
      "Ta session Lichess ne couvre pas encore l'écriture d'études — reconnecte ton compte pour l'accorder.",
    reconnect: 'Reconnecter',
    empty: 'Aucune ouverture à sauvegarder.',
    failed: 'échec — réessaie',
    pushedAt: (when: string) => `poussée le ${when}`,
    neverPushed: 'jamais poussée',
    openStudyTitle: "Ouvrir l'étude miroir sur Lichess",
    pushTitle: 'Pousser cette ouverture vers son étude Lichess',
    pushEmptyTitle: 'Ouverture vide — rien à pousser',
    push: 'Pousser',
  },
};

const en: typeof fr = {
  header: {
    connectedAs: (username: string) => `Signed in as ${username}.`,
    tagline: 'Connect your account to check your games against your repertoire.',
    refresh: 'Refresh',
    signOut: 'Sign out',
  },
  connect: {
    title: 'Connect your Lichess account',
    body: 'Your latest games checked against your repertoire — where did you leave theory, what did your prep expect? — plus the opening explorer with no token to paste. Official OAuth, no scope requested, everything stays stored locally.',
    button: 'Connect Lichess',
  },
  speeds: {
    bullet: 'Bullet',
    blitz: 'Blitz',
    rapid: 'Rapid',
    classical: 'Classical',
  } as Record<string, string>,
  results: { win: 'W', draw: 'D', loss: 'L' },
  defaults: { mainChapter: 'Main', firstLine: 'Line 1', variant: 'Variant' },
  playedOpenings: {
    title: 'Played openings',
    white: 'White',
    black: 'Black',
    empty: 'No recognized games.',
    rowTitle: (games: number, wins: number, draws: number, losses: number) =>
      `${games} game${games > 1 ? 's' : ''} · ${wins}W ${draws}D ${losses}L`,
    favourite: 'favourite',
    coveredTitle: 'This opening is covered by your repertoire',
    covered: '✓ in repertoire',
    createTitle:
      'Create a repertoire for this opening, pre-filled with your most played moves',
    create: 'Create a repertoire',
    alreadyExists: (name: string) => `An opening named “${name}” already exists.`,
  },
  games: {
    title: 'Recent games · against the repertoire',
    loadError: 'Could not load the games — try again in a moment.',
    loading: 'Loading…',
    empty: 'No recent games.',
    prev: '← Previous',
    next: 'Next →',
    pageInfo: (page: number, pageCount: number, total: number) =>
      `Page ${page} / ${pageCount} · ${total} games`,
    hideBifurcation: 'Collapse the bifurcation position',
    showBifurcation: 'Show the bifurcation position',
    revise: 'Review this move',
    reviseTitle: 'Exercise session on the missed-move position',
    addLine: 'Add to repertoire',
    addLineTitle: "Create a variant with the opponent's move and open the editor on it",
    openAtDeviation: 'Open the game on Lichess, at the position where the book was left',
    openGame: 'Open the game on Lichess',
  },
  verdicts: {
    userLeftPlayed: (moveLabel: string) => `Deviated at ${moveLabel}: played`,
    userLeftExpected: ' — rep.:',
    opponentLeft: (moveLabel: string) => `Opponent left book at ${moveLabel}`,
  },
  bifurcation: {
    you: 'You:',
    opponent: 'Opponent:',
    repertoire: 'Repertoire:',
    userHint: '“Review this move” replays this position as an exercise.',
    opponentHint: '“Add to repertoire” grafts this move as a variant to prepare.',
  },
  sync: {
    title: 'Repertoire backup · private Lichess studies',
    pushAll: 'Push all',
    pushing: 'Pushing…',
    authIssue:
      'Your Lichess session does not yet allow writing studies — sign in again to grant it.',
    reconnect: 'Reconnect',
    empty: 'No opening to back up.',
    failed: 'failed — try again',
    pushedAt: (when: string) => `pushed ${when}`,
    neverPushed: 'never pushed',
    openStudyTitle: 'Open the mirror study on Lichess',
    pushTitle: 'Push this opening to its Lichess study',
    pushEmptyTitle: 'Empty opening — nothing to push',
    push: 'Push',
  },
};

export const LICHESS = { fr, en };

export function useLichessStrings() {
  return useStrings(LICHESS);
}
