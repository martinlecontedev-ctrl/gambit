import { describe, it, expect } from 'vitest';
import { parseImportedChapterIds } from './lichessStudySync';

describe('parseImportedChapterIds', () => {
  it('extracts the chapter ids from the import response', () => {
    expect(
      parseImportedChapterIds({
        chapters: [{ id: 'aaaa1111' }, { id: 'bbbb2222' }],
      }),
    ).toEqual(['aaaa1111', 'bbbb2222']);
  });

  it('tolerates malformed entries and missing fields', () => {
    expect(parseImportedChapterIds({})).toEqual([]);
    expect(parseImportedChapterIds({ chapters: [{}, { id: 42 }, { id: 'ok111111' }] })).toEqual([
      'ok111111',
    ]);
  });
});
