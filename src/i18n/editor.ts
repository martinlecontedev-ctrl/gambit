import { useStrings } from './index';

const fr = {
  unsavedConfirm: 'Modifications non enregistrées. Quitter sans enregistrer ?',
  unsaved: 'Non enregistré',
  save: 'Enregistrer',
  saved: 'Enregistré ✓',
  switchChapter: 'Changer de chapitre',
  mainLineName: 'Ligne principale',
  variantName: 'Variante',
  currentLine: 'Ligne en cours',
  chipHint: '(chip) = bascule',
  emptyOpening: 'Ouverture vide. Jouez un coup pour commencer.',
  deleteRest: 'Supprimer la suite',
  deleteRestTitle:
    'Supprime tous les coups après la position courante dans la ligne en cours',
  deleteVariant: 'Supprimer la variante',
  deleteVariantTitle:
    'Supprime cette variante (ses enfants sont rattachés à son parent)',
  rootUndeletable: 'La ligne racine ne peut pas être supprimée',
  engineLabel: 'Engine',
  engineOnTitle: 'Stockfish actif — clic pour désactiver',
  engineOffTitle: 'Activer Stockfish (analyse + flèches de coups suggérés)',
  annotation: 'Annotation',
  moveQuality: 'Qualité du coup',
  comment: 'Commentaire',
  commentPlaceholder: 'Idée du coup, plan, faiblesse à exploiter…',
  shapesOnBoard: (n: number) => `${n} forme${n > 1 ? 's' : ''} sur le plateau`,
  drawArrowsHint: 'Clic-droit-glisser pour dessiner des flèches',
  clearArrows: 'Effacer les flèches',
};

const en: typeof fr = {
  unsavedConfirm: 'Unsaved changes. Leave without saving?',
  unsaved: 'Unsaved',
  save: 'Save',
  saved: 'Saved ✓',
  switchChapter: 'Switch chapter',
  mainLineName: 'Main line',
  variantName: 'Variation',
  currentLine: 'Current line',
  chipHint: '(chip) = switch',
  emptyOpening: 'Empty opening. Play a move to get started.',
  deleteRest: 'Delete the rest',
  deleteRestTitle: 'Deletes every move after the current position in the current line',
  deleteVariant: 'Delete the variation',
  deleteVariantTitle:
    'Deletes this variation (its children are reattached to its parent)',
  rootUndeletable: 'The root line cannot be deleted',
  engineLabel: 'Engine',
  engineOnTitle: 'Stockfish on — click to disable',
  engineOffTitle: 'Enable Stockfish (analysis + suggested-move arrows)',
  annotation: 'Annotation',
  moveQuality: 'Move quality',
  comment: 'Comment',
  commentPlaceholder: 'Move idea, plan, weakness to exploit…',
  shapesOnBoard: (n: number) => `${n} shape${n > 1 ? 's' : ''} on the board`,
  drawArrowsHint: 'Right-click and drag to draw arrows',
  clearArrows: 'Clear arrows',
};

export const EDITOR = { fr, en };

export function useEditorStrings() {
  return useStrings(EDITOR);
}
