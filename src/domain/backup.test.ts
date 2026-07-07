import { describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  backupCounts,
  buildBackup,
  parseBackup,
  type BackupData,
} from './backup';
import type { Opening } from './types';

const opening: Opening = {
  id: 'op-1',
  name: 'Italienne',
  color: 'white',
  chapters: [{ id: 'ch-1', name: 'Principal', order: 0 }],
  lines: [{ id: 'l-1', name: 'Ligne', chapterId: 'ch-1', moves: ['e2e4'] }],
  createdAt: 1,
  updatedAt: 2,
};

const data: BackupData = {
  openings: [opening],
  cards: [
    {
      id: 'op-1::ch-1::fen::e2e4',
      openingId: 'op-1',
      chapterId: 'ch-1',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      expectedUci: 'e2e4',
      ease: 2.5,
      interval: 6,
      reps: 2,
      due: 42,
      lapses: 0,
    },
  ],
  reviews: [{ ts: 10, cardId: 'op-1::ch-1::fen::e2e4', openingId: 'op-1', grade: 4 }],
  folders: [{ id: 'f-1', name: 'Blancs', createdAt: 1 }],
  studySync: { 'op-1': { studyId: 'abc123', chapterIds: ['x1'], pushedAt: 5 } },
};

describe('buildBackup / parseBackup round-trip', () => {
  it('restores exactly what was exported', () => {
    const backup = buildBackup(data, Date.UTC(2026, 6, 7));
    const res = parseBackup(JSON.stringify(backup));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(res.backup.exportedAt).toBe('2026-07-07T00:00:00.000Z');
    expect(res.backup.openings).toEqual(data.openings);
    expect(res.backup.cards).toEqual(data.cards);
    expect(res.backup.reviews).toEqual(data.reviews);
    expect(res.backup.folders).toEqual(data.folders);
    expect(res.backup.studySync).toEqual(data.studySync);
  });
});

describe('parseBackup rejections', () => {
  it('rejects invalid JSON', () => {
    expect(parseBackup('{not json')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('rejects non-Gambit files (wrong app, missing version, PGN pasted as JSON)', () => {
    for (const json of [
      '{}',
      '"une string"',
      '[1,2,3]',
      JSON.stringify({ app: 'anki', schemaVersion: 1 }),
      JSON.stringify({ app: 'gambit' }),
    ]) {
      const res = parseBackup(json);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe('not-gambit');
    }
  });

  it('rejects a backup from a newer schema version', () => {
    const backup = { ...buildBackup(data, 0), schemaVersion: BACKUP_SCHEMA_VERSION + 1 };
    const res = parseBackup(JSON.stringify(backup));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('newer-version');
  });

  it('rejects truncated payloads (missing or malformed collections)', () => {
    const base = buildBackup(data, 0);
    const broken: unknown[] = [
      { ...base, cards: undefined },
      { ...base, openings: 'oops' },
      { ...base, studySync: [] },
      { ...base, openings: [{ name: 'sans id' }] },
    ];
    for (const b of broken) {
      const res = parseBackup(JSON.stringify(b));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe('malformed');
    }
  });

  it('tolerates a missing exportedAt (still restorable)', () => {
    const { exportedAt: _drop, ...rest } = buildBackup(data, 0);
    const res = parseBackup(JSON.stringify(rest));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.backup.exportedAt).toBe('');
  });
});

describe('backupCounts', () => {
  it('counts every collection', () => {
    expect(backupCounts(data)).toEqual({ openings: 1, cards: 1, reviews: 1, folders: 1 });
  });
});
