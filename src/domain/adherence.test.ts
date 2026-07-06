import { describe, it, expect } from 'vitest';
import { buildAdherenceReport, refineAdherence } from './adherence';
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

describe('refineAdherence', () => {
  it('reclassifies a repeated ECO-named move as an alternative opening', async () => {
    const report = buildAdherenceReport(
      [game(SCOTCH_GAME), game(SCOTCH_GAME), game(ITALIAN_HELD)],
      [italian],
      'it',
    )!;
    const refined = await refineAdherence(report);
    const alt = refined.leaks[0];
    expect(alt).toMatchObject({ kind: 'alternative', openingName: 'Scotch Game' });
    // The two Scotch d4s leave the denominator: playing the Scotch is not
    // failing the Italian. 4 (held) + 2×2 (scotch e4,Nf3) = 8 counted, all followed.
    expect(refined.alternativeMisses).toBe(2);
    expect(refined.countedDecisions).toBe(report.decisions - 2);
    expect(refined.followed).toBe(refined.countedDecisions);
  });

  it('keeps a one-off move as a lapse, even when it lands in named theory', async () => {
    const report = buildAdherenceReport(
      [game(ITALIAN_HELD), game(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])],
      [italian],
      'it',
    )!;
    const refined = await refineAdherence(report);
    expect(refined.leaks[0]).toMatchObject({ missSan: 'Bb5', kind: 'lapse' });
    expect(refined.alternativeMisses).toBe(0);
  });

  it('marks repeated unnamed junk as a disagreement, not an alternative', async () => {
    const report = buildAdherenceReport(
      [
        game(['e4', 'e5', 'Nf3', 'Nc6', 'a4', 'a5']),
        game(['e4', 'e5', 'Nf3', 'Nc6', 'a4', 'd6']),
      ],
      [italian],
      'it',
    )!;
    const refined = await refineAdherence(report);
    expect(refined.leaks[0]).toMatchObject({
      missSan: 'a4',
      kind: 'disagreement',
    });
    expect(refined.alternativeMisses).toBe(0);
  });
});
