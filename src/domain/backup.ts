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

/** Error CODES, not messages — the UI translates them (i18n/menu.ts). */
export type BackupParseError = 'invalid-json' | 'not-gambit' | 'newer-version' | 'malformed';

export type ParseBackupResult =
  | { ok: true; backup: Backup }
  | { ok: false; error: BackupParseError };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const everyHasStringId = (arr: unknown[]): boolean =>
  arr.every(e => isRecord(e) && typeof e.id === 'string');

/**
 * Validate a candidate backup file. Checks are structural, not exhaustive:
 * entries only need the fields the repos key on — openings then go through
 * the regular read migration, so older shapes inside a valid envelope load
 * fine.
 */
export function parseBackup(json: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (!isRecord(raw) || raw.app !== 'gambit' || typeof raw.schemaVersion !== 'number') {
    return { ok: false, error: 'not-gambit' };
  }
  if (raw.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: 'newer-version' };
  }
  const { openings, cards, reviews, folders, studySync } = raw;
  if (
    !Array.isArray(openings) ||
    !Array.isArray(cards) ||
    !Array.isArray(reviews) ||
    !Array.isArray(folders) ||
    !isRecord(studySync)
  ) {
    return { ok: false, error: 'malformed' };
  }
  if (!everyHasStringId(openings) || !everyHasStringId(cards) || !everyHasStringId(folders)) {
    return { ok: false, error: 'malformed' };
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

/** Raw counts for the confirm dialog — the UI words them (i18n/menu.ts). */
export function backupCounts(d: BackupData): {
  openings: number;
  cards: number;
  reviews: number;
  folders: number;
} {
  return {
    openings: d.openings.length,
    cards: d.cards.length,
    reviews: d.reviews.length,
    folders: d.folders.length,
  };
}
