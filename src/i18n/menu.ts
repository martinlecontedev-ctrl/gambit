import type { BackupParseError } from '../domain/backup';
import type { ThemeId } from '../domain/theme';
import { useStrings } from './index';

type Counts = { openings: number; cards: number; reviews: number; folders: number };

const frN = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count > 1 ? plural : singular}`;
const enN = frN; // same rule works for the English words used here

const fr = {
  button: 'Préférences',
  themeSection: 'Thème',
  themes: {
    'clair-noyer': { label: 'Clair · Noyer', hint: 'Fond greige, plateau bois' },
    'miton-vertorange': {
      label: 'Mi-ton · Vert & orange',
      hint: 'Fond vert profond, cartes claires',
    },
    'sombre-vertnuit': { label: 'Sombre · Vert nuit', hint: 'Fond vert nuit, cartes sombres' },
  } as Record<ThemeId, { label: string; hint: string }>,
  langSection: 'Langue',
  dataSection: 'Données',
  exportBtn: 'Exporter',
  restoreBtn: 'Restaurer…',
  dataNote:
    'Fichier complet : répertoires, progrès de révision, historique, dossiers. Le compte Lichess et les réglages locaux ne sont pas inclus.',
  backupFileName: 'gambit-sauvegarde',
  exported: (s: string) => `Exporté : ${s}.`,
  restored: 'Sauvegarde restaurée.',
  summary: (c: Counts) =>
    [
      frN(c.openings, 'ouverture'),
      frN(c.cards, 'carte'),
      frN(c.reviews, 'révision'),
      frN(c.folders, 'dossier'),
    ].join(', '),
  unknownDate: 'date inconnue',
  restoreConfirm: (file: string, current: string, exportedOn: string) =>
    `Restaurer cette sauvegarde ?\n\nFichier (${exportedOn}) : ${file}\nActuellement : ${current}\n\nToutes les données actuelles seront REMPLACÉES.`,
  parseErrors: {
    'invalid-json': 'Fichier illisible (JSON invalide).',
    'not-gambit': 'Ce fichier n’est pas une sauvegarde Gambit.',
    'newer-version':
      'Sauvegarde issue d’une version plus récente de Gambit — mets l’application à jour avant de restaurer.',
    malformed: 'Sauvegarde incomplète ou corrompue.',
  } as Record<BackupParseError, string>,
};

const en: typeof fr = {
  button: 'Preferences',
  themeSection: 'Theme',
  themes: {
    'clair-noyer': { label: 'Light · Walnut', hint: 'Greige background, wooden board' },
    'miton-vertorange': {
      label: 'Mid-tone · Green & orange',
      hint: 'Deep green background, light cards',
    },
    'sombre-vertnuit': { label: 'Dark · Night green', hint: 'Night-green background, dark cards' },
  } as Record<ThemeId, { label: string; hint: string }>,
  langSection: 'Language',
  dataSection: 'Data',
  exportBtn: 'Export',
  restoreBtn: 'Restore…',
  dataNote:
    'Complete file: repertoires, review progress, history, folders. The Lichess account and device settings are not included.',
  backupFileName: 'gambit-backup',
  exported: (s: string) => `Exported: ${s}.`,
  restored: 'Backup restored.',
  summary: (c: Counts) =>
    [
      enN(c.openings, 'opening'),
      enN(c.cards, 'card'),
      enN(c.reviews, 'review'),
      enN(c.folders, 'folder'),
    ].join(', '),
  unknownDate: 'unknown date',
  restoreConfirm: (file: string, current: string, exportedOn: string) =>
    `Restore this backup?\n\nFile (${exportedOn}): ${file}\nCurrently: ${current}\n\nAll current data will be REPLACED.`,
  parseErrors: {
    'invalid-json': 'Unreadable file (invalid JSON).',
    'not-gambit': 'This file is not a Gambit backup.',
    'newer-version':
      'Backup from a newer version of Gambit — update the app before restoring.',
    malformed: 'Incomplete or corrupted backup.',
  } as Record<BackupParseError, string>,
};

export const MENU = { fr, en };

export function useMenuStrings() {
  return useStrings(MENU);
}
