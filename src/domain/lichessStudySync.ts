// Push the repertoire to private Lichess studies — one opening, one study.
// The study is created on the first push (API cap: 30 new studies/day) and
// reused after via the locally stored mapping. A push imports the fresh
// chapters (exportToPgn is already study-shaped: one game per chapter),
// THEN deletes the previously pushed ones — in that order so the study is
// never empty; the 64-chapter study cap only binds during the transition.
// Strictly one-way: Gambit only ever writes to studies it created.

import { exportToPgn } from './pgn';
import type { Opening, StudySync } from './types';

const API = 'https://lichess.org';

/** 401/403 — the token lacks study:write (session predating the scope, or
 * revoked). The caller prompts for a re-login. */
export class StudyWriteUnauthorized extends Error {
  constructor() {
    super('study write unauthorized');
  }
}

type RawImport = { chapters?: { id?: unknown }[] };

export function parseImportedChapterIds(raw: RawImport): string[] {
  return (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map(c => c.id)
    .filter((id): id is string => typeof id === 'string');
}

async function call(
  path: string,
  token: string,
  body: URLSearchParams | null,
  method = 'POST',
): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ?? undefined,
  });
  if (res.status === 401 || res.status === 403) throw new StudyWriteUnauthorized();
  return res;
}

async function createStudy(name: string, token: string): Promise<string> {
  const res = await call(
    '/api/study',
    token,
    new URLSearchParams({
      name: name.slice(0, 100),
      visibility: 'private',
      computer: 'member',
      explorer: 'member',
      cloneable: 'nobody',
      shareable: 'member',
      chat: 'nobody',
    }),
  );
  if (!res.ok) throw new Error(`Study create HTTP ${res.status}`);
  const { id } = (await res.json()) as { id?: unknown };
  if (typeof id !== 'string') throw new Error('Study create: missing id');
  return id;
}

/** `null` = the study no longer exists on Lichess (deleted by hand). */
async function importChapters(
  studyId: string,
  pgn: string,
  orientation: string,
  token: string,
): Promise<string[] | null> {
  const res = await call(
    `/api/study/${studyId}/import-pgn`,
    token,
    new URLSearchParams({ pgn, orientation }),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Study import HTTP ${res.status}`);
  return parseImportedChapterIds((await res.json()) as RawImport);
}

async function deleteChapter(
  studyId: string,
  chapterId: string,
  token: string,
): Promise<void> {
  // Best effort — a 404 just means it was already removed by hand.
  await call(`/api/study/${studyId}/${chapterId}`, token, null, 'DELETE');
}

export async function pushOpeningToStudy(
  opening: Opening,
  token: string,
  prev: StudySync | undefined,
): Promise<StudySync> {
  const pgn = exportToPgn(opening);
  if (!pgn.trim()) throw new Error('Rien à pousser : ouverture sans coups.');

  let studyId = prev?.studyId;
  let previousChapters = prev?.chapterIds ?? [];
  let chapterIds: string[] | null = null;

  if (studyId) {
    chapterIds = await importChapters(studyId, pgn, opening.color, token);
    if (chapterIds === null) {
      // Mirror study deleted on Lichess — start a fresh one.
      studyId = undefined;
      previousChapters = [];
    }
  }
  if (!studyId || chapterIds === null) {
    studyId = await createStudy(`Gambit — ${opening.name}`, token);
    chapterIds = await importChapters(studyId, pgn, opening.color, token);
    if (chapterIds === null) {
      throw new Error('Study import: study vanished right after creation');
    }
  }
  for (const chapterId of previousChapters) {
    if (!chapterIds.includes(chapterId)) {
      await deleteChapter(studyId, chapterId, token);
    }
  }
  return { studyId, chapterIds, pushedAt: Date.now() };
}
