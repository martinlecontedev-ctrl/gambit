import type { Card, Folder, Opening, ReviewEvent, StudySync } from './types';

/**
 * Full-state backup: everything localStorage holds that can't be rebuilt —
 * repertoires, SRS cards (ease/interval/due), review history, folders and
 * Lichess study mappings. Deliberately excluded: the Lichess account token
 * (a secret, re-obtained by logging in) and device preferences (theme,
 * engine/explorer toggles).
 *
 * This module is pure (no storage access) so it tests in the node
 * environment; the read/write glue lives in storage/repository.ts.
 */

export const BACKUP_SCHEMA_VERSION = 1;

export type BackupData = {
  openings: Opening[];
  cards: Card[];
  reviews: ReviewEvent[];
  folders: Folder[];
  studySync: Record<string, StudySync>;
};

export type Backup = BackupData & {
  app: 'gambit';
  schemaVersion: number;
  /** ISO date-time of the export. */
  exportedAt: string;
};

export function buildBackup(data: BackupData, now: number): Backup {
  return {
    app: 'gambit',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    openings: data.openings,
    cards: data.cards,
    reviews: data.reviews,
    folders: data.folders,
    studySync: data.studySync,
  };
}

export type ParseBackupResult =
  | { ok: true; backup: Backup }
  | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const everyHasStringId = (arr: unknown[]): boolean =>
  arr.every(e => isRecord(e) && typeof e.id === 'string');

/**
 * Validate a candidate backup file. Checks are structural, not exhaustive:
 * entries only need the fields the repos key on — openings then go through
 * the regular read migration, so older shapes inside a valid envelope load
 * fine. Errors are user-facing (French).
 */
export function parseBackup(json: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Fichier illisible (JSON invalide).' };
  }
  if (!isRecord(raw) || raw.app !== 'gambit' || typeof raw.schemaVersion !== 'number') {
    return { ok: false, error: 'Ce fichier n’est pas une sauvegarde Gambit.' };
  }
  if (raw.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: 'Sauvegarde issue d’une version plus récente de Gambit — mets l’application à jour avant de restaurer.',
    };
  }
  const { openings, cards, reviews, folders, studySync } = raw;
  if (
    !Array.isArray(openings) ||
    !Array.isArray(cards) ||
    !Array.isArray(reviews) ||
    !Array.isArray(folders) ||
    !isRecord(studySync)
  ) {
    return { ok: false, error: 'Sauvegarde incomplète ou corrompue.' };
  }
  if (!everyHasStringId(openings) || !everyHasStringId(cards) || !everyHasStringId(folders)) {
    return { ok: false, error: 'Sauvegarde incomplète ou corrompue.' };
  }
  return {
    ok: true,
    backup: {
      app: 'gambit',
      schemaVersion: raw.schemaVersion,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      openings: openings as Opening[],
      cards: cards as Card[],
      reviews: reviews as ReviewEvent[],
      folders: folders as Folder[],
      studySync: studySync as Record<string, StudySync>,
    },
  };
}

/** One-line human summary for confirm dialogs: "3 ouvertures, 128 cartes…". */
export function backupSummary(d: BackupData): string {
  // French pluralization: zero takes the singular (« 0 ouverture »).
  const n = (count: number, singular: string, plural = `${singular}s`) =>
    `${count} ${count > 1 ? plural : singular}`;
  return [
    n(d.openings.length, 'ouverture'),
    n(d.cards.length, 'carte'),
    n(d.reviews.length, 'révision'),
    n(d.folders.length, 'dossier'),
  ].join(', ');
}
