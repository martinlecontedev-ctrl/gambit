import { useStrings } from './index';

const fr = {
  title: 'Ouvertures',
  emptySubtitle: 'Créez votre première ouverture pour commencer.',
  counts: (o: number, f: number) =>
    `${o} ouverture${o > 1 ? 's' : ''} · ${f} dossier${f > 1 ? 's' : ''}`,
  importBtn: 'Importer',
  newOpeningBtn: '+ Nouvelle ouverture',
  white: 'Blancs',
  black: 'Noirs',
  banner: {
    allDone: 'Tout est à jour',
    reviewedToday: (n: number) =>
      `${n} position${n > 1 ? 's' : ''} révisée${n > 1 ? 's' : ''} aujourd'hui.`,
    nothingToday: "Rien à réviser pour aujourd'hui.",
    dueToday: (n: number) => `position${n > 1 ? 's' : ''} à réviser aujourd'hui`,
    spread: (due: number, openings: number) =>
      `réparti${due > 1 ? 'es' : 'e'} sur ${openings} ouverture${openings > 1 ? 's' : ''}`,
    start: 'Démarrer la révision',
    progress: (done: number, left: number) =>
      `${done} faite${done > 1 ? 's' : ''} · ${left} restante${left > 1 ? 's' : ''}`,
  },
  activity: {
    streakTitle: 'Série',
    daysInARow: (n: number) => `jour${n > 1 ? 's' : ''} d'affilée`,
    doneToday: "Validée aujourd'hui",
    keepIt: "Révise aujourd'hui pour la garder",
    startIt: 'Révise une position pour la lancer',
    record: 'Record :',
    days: (n: number) => `jour${n > 1 ? 's' : ''}`,
    reviewsYear: (n: number) => `révision${n > 1 ? 's' : ''} sur 12 mois`,
    graphTitle: 'Activité · 8 semaines',
    peak: (n: number) => `pic : ${n} révision${n > 1 ? 's' : ''} / jour`,
    noBars: 'une barre par jour — la première révision la fait naître',
    dayTooltip: (n: number, date: string) => `${n} révision${n > 1 ? 's' : ''} · ${date}`,
    today: "aujourd'hui",
  },
  folders: {
    title: 'Dossiers',
    none: 'Sans dossier',
    namePlaceholder: 'Nom du dossier',
    newFolder: '+ Nouveau dossier',
    rename: 'Renommer',
    deleteTitle: 'Supprimer le dossier',
    deleteConfirm: (name: string, count: number) => {
      let message = `Supprimer le dossier "${name}" ?`;
      if (count > 0) {
        const plural = count > 1;
        message +=
          `\n\n⚠️  LE CONTENU DE CE DOSSIER SERA ÉGALEMENT SUPPRIMÉ.` +
          `\n\n${count} ouverture${plural ? 's' : ''} ${plural ? 'vont' : 'va'} disparaître, avec leurs lignes, annotations et cartes de révision.` +
          `\n\nCette action est définitive.`;
      }
      return message;
    },
  },
  card: {
    lines: (n: number) => `${n} ligne${n > 1 ? 's' : ''}`,
    deleteConfirm: (name: string) =>
      `Supprimer "${name}" ?\n\nLes lignes, annotations et cartes de révision associées seront perdues.`,
    deleteTitle: 'Supprimer cette ouverture',
    mastery: 'Maîtrise',
    notInReview: 'Hors révision',
    due: (n: number) => `${n} à réviser`,
    reviewed: 'Révisé',
    review: 'Réviser',
    open: 'Ouvrir',
  },
  empty: {
    root: 'Aucune ouverture hors dossier.',
    folder:
      'Ce dossier est vide. Glisse-dépose une ouverture ici depuis un autre dossier.',
  },
  importModal: {
    title: 'Importer une ouverture',
    previewTitle: "Confirmer l'import",
    willCreateLead: "L'import va créer ",
    willCreateCount: (n: number) => `${n} nouvelles ouvertures`,
    groupLabel: 'Regrouper dans un dossier',
    folderNew: 'Nouveau',
    folderExisting: 'Existant',
    folderNone: 'Aucun',
    playedSide: (side: string) => `Camp joué : ${side}.`,
    sideLabel: 'Camp joué',
    back: 'Retour',
    confirm: 'Confirmer',
    modeFile: 'Fichier',
    pgnPlaceholder: 'Colle ton PGN ici',
    lichessHint: 'Études publiques uniquement. Un chapitre = une ouverture.',
    errEmptyPgn: 'PGN vide',
    errNoGames: 'Aucune partie avec coups trouvée',
    imported: (n: number, folder?: string) =>
      `${n} ouvertures importées${folder ? ` dans "${folder}"` : ''}.`,
    close: 'Fermer',
    cancel: 'Annuler',
    importing: 'Import…',
    submit: 'Importer',
  },
  newOpening: {
    title: 'Nouvelle ouverture',
    nameLabel: 'Nom',
    namePlaceholder: 'Sicilienne — Najdorf',
    colorLabel: 'Couleur jouée',
    duplicate: (name: string) => `Une ouverture nommée « ${name} » existe déjà.`,
    cancel: 'Annuler',
    create: 'Créer',
    defaultChapter: 'Principal',
    defaultLine: 'Ligne 1',
  },
};

const en: typeof fr = {
  title: 'Openings',
  emptySubtitle: 'Create your first opening to get started.',
  counts: (o: number, f: number) =>
    `${o} opening${o > 1 ? 's' : ''} · ${f} folder${f > 1 ? 's' : ''}`,
  importBtn: 'Import',
  newOpeningBtn: '+ New opening',
  white: 'White',
  black: 'Black',
  banner: {
    allDone: 'All caught up',
    reviewedToday: (n: number) => `${n} position${n > 1 ? 's' : ''} reviewed today.`,
    nothingToday: 'Nothing to review today.',
    dueToday: (n: number) => `position${n > 1 ? 's' : ''} due today`,
    spread: (_due: number, openings: number) =>
      `across ${openings} opening${openings > 1 ? 's' : ''}`,
    start: 'Start reviewing',
    progress: (done: number, left: number) => `${done} done · ${left} left`,
  },
  activity: {
    streakTitle: 'Streak',
    daysInARow: (n: number) => `day${n > 1 ? 's' : ''} in a row`,
    doneToday: 'Done for today',
    keepIt: 'Review today to keep it',
    startIt: 'Review one position to start it',
    record: 'Best:',
    days: (n: number) => `day${n > 1 ? 's' : ''}`,
    reviewsYear: (n: number) => `review${n > 1 ? 's' : ''} over 12 months`,
    graphTitle: 'Activity · 8 weeks',
    peak: (n: number) => `peak: ${n} review${n > 1 ? 's' : ''} / day`,
    noBars: 'one bar per day — your first review brings it to life',
    dayTooltip: (n: number, date: string) => `${n} review${n > 1 ? 's' : ''} · ${date}`,
    today: 'today',
  },
  folders: {
    title: 'Folders',
    none: 'No folder',
    namePlaceholder: 'Folder name',
    newFolder: '+ New folder',
    rename: 'Rename',
    deleteTitle: 'Delete folder',
    deleteConfirm: (name: string, count: number) => {
      let message = `Delete the folder "${name}"?`;
      if (count > 0) {
        message +=
          `\n\n⚠️  EVERYTHING IN THIS FOLDER WILL BE DELETED TOO.` +
          `\n\n${count} opening${count > 1 ? 's' : ''} will disappear, along with their lines, annotations and review cards.` +
          `\n\nThis cannot be undone.`;
      }
      return message;
    },
  },
  card: {
    lines: (n: number) => `${n} line${n > 1 ? 's' : ''}`,
    deleteConfirm: (name: string) =>
      `Delete "${name}"?\n\nIts lines, annotations and review cards will be lost.`,
    deleteTitle: 'Delete this opening',
    mastery: 'Mastery',
    notInReview: 'Not in review',
    due: (n: number) => `${n} due`,
    reviewed: 'Reviewed',
    review: 'Review',
    open: 'Open',
  },
  empty: {
    root: 'No openings outside a folder.',
    folder: 'This folder is empty. Drag an opening here from another folder.',
  },
  importModal: {
    title: 'Import an opening',
    previewTitle: 'Confirm import',
    willCreateLead: 'This import will create ',
    willCreateCount: (n: number) => `${n} new openings`,
    groupLabel: 'Group into a folder',
    folderNew: 'New',
    folderExisting: 'Existing',
    folderNone: 'None',
    playedSide: (side: string) => `Playing side: ${side}.`,
    sideLabel: 'Playing side',
    back: 'Back',
    confirm: 'Confirm',
    modeFile: 'File',
    pgnPlaceholder: 'Paste your PGN here',
    lichessHint: 'Public studies only. One chapter = one opening.',
    errEmptyPgn: 'Empty PGN',
    errNoGames: 'No game with moves found',
    imported: (n: number, folder?: string) =>
      `${n} openings imported${folder ? ` into "${folder}"` : ''}.`,
    close: 'Close',
    cancel: 'Cancel',
    importing: 'Importing…',
    submit: 'Import',
  },
  newOpening: {
    title: 'New opening',
    nameLabel: 'Name',
    namePlaceholder: 'Sicilian — Najdorf',
    colorLabel: 'Playing color',
    duplicate: (name: string) => `An opening named "${name}" already exists.`,
    cancel: 'Cancel',
    create: 'Create',
    defaultChapter: 'Main',
    defaultLine: 'Line 1',
  },
};

export const HOME = { fr, en };

export function useHomeStrings() {
  return useStrings(HOME);
}
