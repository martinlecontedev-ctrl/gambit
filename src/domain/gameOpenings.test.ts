import { describe, it, expect } from 'vitest';
import { buildPositionOwners } from './deviation';
import { aggregatePlayedOpenings } from './gameOpenings';
import type { RecentGame } from './lichessGames';
import type { Opening } from './types';

const game = (
  sans: string[],
  result: RecentGame['result'],
  userColor: RecentGame['userColor'] = 'white',
): RecentGame => ({
  id: Math.random().toString(36).slice(2, 10),
  speed: 'blitz',
  rated: true,
  opponent: 'Adv',
  userColor,
  result,
  sans,
  createdAt: 0,
});

const ITALIAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'];
const SCOTCH = ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4'];

describe('aggregatePlayedOpenings', () => {
  it('groups by opening family and counts results, most played first', async () => {
    const stats = await aggregatePlayedOpenings([
      game(SCOTCH, 'win'),
      game(SCOTCH, 'loss'),
      game(SCOTCH, 'draw'),
      game(ITALIAN, 'win'),
    ]);
    expect(stats[0]).toMatchObject({
      name: 'Scotch Game',
      color: 'white',
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
    });
    expect(stats[1]).toMatchObject({ name: 'Italian Game', games: 1 });
  });

  it('separates colors — the same family twice if played on both sides', async () => {
    const stats = await aggregatePlayedOpenings([
      game(ITALIAN, 'win', 'white'),
      game(ITALIAN, 'loss', 'black'),
    ]);
    expect(stats.map(s => [s.name, s.color]).sort()).toEqual([
      ['Italian Game', 'black'],
      ['Italian Game', 'white'],
    ]);
  });

  it('seeds with the most played prefix and keys the family position', async () => {
    const [s] = await aggregatePlayedOpenings([
      game(SCOTCH, 'win'),
      game(SCOTCH, 'win'),
    ]);
    // Seed reaches the deepest recognized position of the games.
    expect(s.seedUcis.slice(0, 5)).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4']);
    // Family key sits at the FIRST "Scotch Game" match (3.d4), not deeper.
    expect(s.familyKey).toContain('b KQkq'); // black to move after 3.d4
  });

  it('skips games whose moves cannot be parsed', async () => {
    expect(await aggregatePlayedOpenings([game(['Zz9'], 'win')])).toEqual([]);
  });

  it('a repertoire created from the seed covers familyKey immediately', async () => {
    // The "Créer un répertoire" button seeds an opening with `seedUcis`;
    // the coverage test (`owners.has(familyKey)`) must flip right away —
    // even when the family's first match sits at the very END of the seed
    // (a line-end position) or the seed route differs from another game's.
    const [s] = await aggregatePlayedOpenings([
      game(ITALIAN, 'win'),
      // Recognition stops at 3.Bc4 here (unnamed continuation), so this
      // game's seed ENDS on the family position.
      game(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'a6'], 'win'),
    ]);
    const chapterId = 'ch';
    const created: Opening = {
      id: 'created',
      name: s.name,
      color: s.color,
      chapters: [{ id: chapterId, name: 'Principal', order: 0 }],
      lines: [{ id: 'l', name: 'Ligne 1', chapterId, moves: s.seedUcis }],
      createdAt: 0,
      updatedAt: 0,
    };
    expect(buildPositionOwners([created], s.color).has(s.familyKey)).toBe(true);
  });
});
