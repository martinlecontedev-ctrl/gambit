import { useStrings } from './index';

/** Strings for the opening overview page (openings.$openingId.index.tsx):
 * chapter sidebar, action buttons, scoresheet, adherence card, review-range
 * and PGN-export modals. */
const fr = {
  subtitle: (color: 'white' | 'black', lines: number) =>
    `${color === 'white' ? 'Blancs' : 'Noirs'} · ${lines} ligne${lines > 1 ? 's' : ''}`,
  chapters: 'Chapitres',
  newChapter: '+ Nouveau chapitre',
  mainLine: 'Ligne principale',
  deleteBtn: 'Supprimer',
  exportBtn: 'Exporter',
  editBtn: 'Éditer',
  reviewBtn: 'Réviser',
  deleteOpeningConfirm: 'Supprimer cette ouverture ?',
  cannotDeleteLastChapter: "Impossible de supprimer le dernier chapitre d'une ouverture.",
  deleteChapterConfirm: (name: string, lines: number) =>
    `Supprimer le chapitre "${name}" ?` +
    (lines > 0
      ? `\n\n⚠️  ${lines} ligne${lines > 1 ? 's' : ''} et toutes les cartes de révision liées seront supprimées.`
      : '') +
    `\n\nCette action est définitive.`,

  // Scoresheet
  currentLine: 'Ligne en cours',
  chipHint: '(chip) = bascule',
  emptyOpening: 'Ouverture vide. Passe en édition pour jouer des coups.',
  annotationTitle: 'Annotation',

  // Chapter item hover actions
  customRangeBadgeTitle: 'Révision limitée à une fenêtre de coups',
  defineReviewTitle: 'Définir la révision (fenêtre de coups à driller)',
  renameTitle: 'Renommer',
  deleteChapterTitle: 'Supprimer le chapitre',

  // Adherence card
  adherenceTitle: 'Fidélité · Lichess',
  followedRatio: (followed: number, counted: number) => `${followed}/${counted} suivis`,
  gamesCount: (n: number) => `${n} partie${n > 1 ? 's' : ''}`,
  excludedMoves: (n: number) => ` · ${n} coups exclus (autre ouverture)`,
  noLeaks: 'Aucun coup manqué — la théorie tient.',
  leakAlternative: (head: string, opening: string, missSan: string, topCount: number) =>
    `${head} — tu joues aussi ${opening} ici (${missSan} ×${topCount}) : autre ouverture, hors calcul`,
  leakDisagreement: (head: string, missSan: string, count: number) =>
    `${head} — tu joues ${missSan} systématiquement (${count}×) : révise, ou adapte le répertoire`,
  leakLapse: (head: string, missSan: string, count: number, seen: number, memoryLapse: boolean) =>
    `${head} — joué ${missSan} ${count}× sur ${seen} passage${seen > 1 ? 's' : ''}${
      memoryLapse ? ' (trou de mémoire)' : ''
    }`,
  toLichess: '→ Lichess',
  toLichessTitle:
    'Voir tes ouvertures jouées — et créer son répertoire si tu veux la driller',
  reviewedBadge: 'Révisé ✓',
  reviewedTitle:
    'Bon coup joué en révision depuis le dernier raté en partie — se rouvrira si une nouvelle partie le rate encore',
  collapse: 'Réduire',
  moreLeaks: (n: number) => `+${n} autre${n > 1 ? 's' : ''}`,

  // Review-range modal
  rangeModalTitle: (chapter: string) => `Définir la révision — ${chapter}`,
  rangeIntro:
    "Le tronc commun regroupe les coups partagés par toutes les variantes ; chaque branche se règle à partir de sa bifurcation. Clique le premier puis le dernier coup à réviser dans chaque bloc. Hors fenêtre, rien n'est dû ni compté dans la maîtrise — le progrès des cartes est conservé si tu réélargis.",
  emptyChapter: 'Ce chapitre ne contient encore aucun coup.',
  sharedTrunk: 'Tronc commun',
  drilledCount: (n: number) => `${n} coup${n > 1 ? 's' : ''} à driller`,
  nothingToDrill: 'rien à driller',
  all: 'Tout',
  none: 'Aucun',
  totalDrilled: (n: number) => `${n} coup${n > 1 ? 's' : ''} à driller dans ce chapitre`,
  save: 'Enregistrer',

  // Export modal
  exportModalTitle: 'Exporter en PGN',
  exportIntro:
    'Compatible Lichess Study, ChessBase, Chessable. Un chapitre = une partie PGN. Inclut variantes, commentaires, NAGs et flèches.',
  copy: 'Copier',
  copied: 'Copié ✓',
};

const en: typeof fr = {
  subtitle: (color, lines) =>
    `${color === 'white' ? 'White' : 'Black'} · ${lines} line${lines > 1 ? 's' : ''}`,
  chapters: 'Chapters',
  newChapter: '+ New chapter',
  mainLine: 'Main line',
  deleteBtn: 'Delete',
  exportBtn: 'Export',
  editBtn: 'Edit',
  reviewBtn: 'Review',
  deleteOpeningConfirm: 'Delete this opening?',
  cannotDeleteLastChapter: "Cannot delete an opening's last chapter.",
  deleteChapterConfirm: (name, lines) =>
    `Delete chapter "${name}"?` +
    (lines > 0
      ? `\n\n⚠️  ${lines} line${lines > 1 ? 's' : ''} and all linked review cards will be deleted.`
      : '') +
    `\n\nThis action is permanent.`,

  currentLine: 'Current line',
  chipHint: '(chip) = switch',
  emptyOpening: 'Empty opening. Switch to edit mode to play moves.',
  annotationTitle: 'Annotation',

  customRangeBadgeTitle: 'Review limited to a move window',
  defineReviewTitle: 'Set up review (window of moves to drill)',
  renameTitle: 'Rename',
  deleteChapterTitle: 'Delete chapter',

  adherenceTitle: 'Adherence · Lichess',
  followedRatio: (followed, counted) => `${followed}/${counted} followed`,
  gamesCount: n => `${n} game${n > 1 ? 's' : ''}`,
  excludedMoves: n => ` · ${n} moves excluded (other opening)`,
  noLeaks: 'No missed moves — the theory holds.',
  leakAlternative: (head, opening, missSan, topCount) =>
    `${head} — you also play ${opening} here (${missSan} ×${topCount}): another opening, excluded from the math`,
  leakDisagreement: (head, missSan, count) =>
    `${head} — you play ${missSan} systematically (${count}×): review it, or adapt the repertoire`,
  leakLapse: (head, missSan, count, seen, memoryLapse) =>
    `${head} — played ${missSan} ${count}× over ${seen} visit${seen > 1 ? 's' : ''}${
      memoryLapse ? ' (memory lapse)' : ''
    }`,
  toLichess: '→ Lichess',
  toLichessTitle:
    'See your played openings — and create its repertoire if you want to drill it',
  reviewedBadge: 'Reviewed ✓',
  reviewedTitle:
    'Correct move played in review since the last miss in a game — reopens if a new game misses it again',
  collapse: 'Collapse',
  moreLeaks: n => `+${n} more`,

  rangeModalTitle: chapter => `Set up review — ${chapter}`,
  rangeIntro:
    'The shared trunk groups the moves common to every variation; each branch is set from its fork on. Click the first then the last move to review in each block. Outside the window, nothing is due or counted towards mastery — card progress is kept if you widen the window again.',
  emptyChapter: 'This chapter has no moves yet.',
  sharedTrunk: 'Shared trunk',
  drilledCount: n => `${n} move${n > 1 ? 's' : ''} to drill`,
  nothingToDrill: 'nothing to drill',
  all: 'All',
  none: 'None',
  totalDrilled: n => `${n} move${n > 1 ? 's' : ''} to drill in this chapter`,
  save: 'Save',

  exportModalTitle: 'Export to PGN',
  exportIntro:
    'Compatible with Lichess Study, ChessBase, Chessable. One chapter = one PGN game. Includes variations, comments, NAGs and arrows.',
  copy: 'Copy',
  copied: 'Copied ✓',
};

export const OVERVIEW = { fr, en };

export function useOverviewStrings() {
  return useStrings(OVERVIEW);
}
