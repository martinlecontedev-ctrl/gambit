import { describe, it, expect } from 'vitest';
import { buildAdherenceReport } from './adherence';
import type { Color, Opening } from './types';

const opening = (id: string, name: string, moves: string[]): Opening => ({
  id,
  name,
  color: 'white',
  chapters: [{ id: `${id}-ch`, name: 'Principal', order: 0 }],
  lines: [{ id: `${id}-l`, name: 'main', chapterId: `${id}-ch`, moves }],
  createdAt: 0,
  updatedAt: 0,
});

const italian = opening('it', 'Italienne', [
  'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3',
]);
const scotch = opening('sc', 'Écossaise', [
  'e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4',
]);

const game = (sans: string[], createdAt = 0, userColor: Color = 'white') => ({
  sans,
  userColor,
  createdAt,
});

const ITALIAN_HELD = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6'];
const SCOTCH_GAME = ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'];

describe('buildAdherenceReport', () => {
  it('counts decisions, adherence and exits over attributed games', () => {
    const r = buildAdherenceReport(
      [
        game(ITALIAN_HELD),
        game(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']), // lapse at move 3
        game(['e4', 'e5', 'Nf3', 'd6', 'd4']), // opponent leaves at 2...d6
      ],
      [italian],
      'it',
    );
    expect(r).not.toBeNull();
    // Game 1: decisions e4, Nf3, Bc4, c3 (all followed, then book ends).
    // Game 2: e4, Nf3 followed, then Bb5 missed. Game 3: e4, Nf3 followed.
    expect(r!.games).toBe(3);
    expect(r!.decisions).toBe(4 + 3 + 2);
    expect(r!.followed).toBe(4 + 2 + 2);
    expect(r!.held).toBe(1);
    expect(r!.userExits).toBe(1);
    expect(r!.opponentExits).toBe(1);
    expect(r!.leaks).toHaveLength(1);
    // The leak knows the user's own baseline: 1 miss out of 2 passages.
    expect(r!.leaks[0]).toMatchObject({
      seen: 2,
      followed: 1,
      missSan: 'Bb5',
      missCount: 1,
      expectedSans: ['Bc4'],
    });
  });

  it('attributes a game to the deepest-followed opening only', () => {
    const games = [game(SCOTCH_GAME)];
    // With a Scotch repertoire, the Scotch game leaves the Italian report.
    const withScotch = buildAdherenceReport(games, [italian, scotch], 'it');
    expect(withScotch).toBeNull();
    expect(
      buildAdherenceReport(games, [italian, scotch], 'sc')?.followed,
    ).toBe(3);
    // Without it, the Italian report absorbs the game as a disagreement.
    const alone = buildAdherenceReport(games, [italian], 'it');
    expect(alone!.leaks[0]).toMatchObject({ missSan: 'd4', followed: 0 });
  });

  it('ignores games of the other color and games barely touching the book', () => {
    const r = buildAdherenceReport(
      [game(['e4', 'e5'], 0, 'black'), game(['d4', 'd5'])],
      [italian],
      'it',
    );
    expect(r).toBeNull();
  });
});
