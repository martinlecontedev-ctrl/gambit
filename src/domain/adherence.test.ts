import { describe, it, expect } from 'vitest';
import {
  buildAdherenceReport,
  leakReviewedSince,
  refineAdherence,
} from './adherence';
import type { Card, Color, Opening, ReviewEvent } from './types';

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

  it('dates each leak at its most recent miss', () => {
    const MISS = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];
    const r = buildAdherenceReport(
      [game(MISS, 100), game(MISS, 300), game(ITALIAN_HELD, 500)],
      [italian],
      'it',
    );
    expect(r!.leaks[0].lastMissAt).toBe(300);
  });

  it('walks through a move-order transposition instead of flagging a phantom leak', () => {
    // Sibling lines: a Petrov (2.Nf3 first) and an Italian-order line
    // (2.Bc4 first). The game mixes the orders — 3.Bc4 from the Petrov
    // position transposes into the sibling. That is the user's OWN
    // repertoire move: no leak, no exit, and the later decisions (4.c3)
    // must still be counted.
    const transpo: Opening = {
      ...opening('tr', 'Transpo', []),
      lines: [
        {
          id: 'petrov',
          name: 'petrov',
          chapterId: 'tr-ch',
          moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5'],
        },
        {
          id: 'ital',
          name: 'italian order',
          chapterId: 'tr-ch',
          moves: ['e2e4', 'e7e5', 'f1c4', 'g8f6', 'g1f3', 'b8c6', 'c2c3', 'f8c5'],
        },
      ],
    };
    const r = buildAdherenceReport(
      [game(['e4', 'e5', 'Nf3', 'Nf6', 'Bc4', 'Nc6', 'c3', 'Bc5'])],
      [transpo],
      'tr',
    );
    expect(r).not.toBeNull();
    expect(r!.leaks).toEqual([]);
    expect(r!.held).toBe(1);
    expect(r!.decisions).toBe(4); // e4, Nf3, Bc4 (transposed), c3
    expect(r!.followed).toBe(4);
  });
});

describe('leakReviewedSince', () => {
  // Position of the leak: after 2...Nc6 (before white's 3rd move).
  const LEAK_KEY =
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -';
  const leakAt = (lastMissAt: number) => {
    const r = buildAdherenceReport(
      [game(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], lastMissAt)],
      [italian],
      'it',
    )!;
    return r.leaks[0];
  };
  const card: Card = {
    id: `it::it-ch::${LEAK_KEY}::f1c4`,
    openingId: 'it',
    chapterId: 'it-ch',
    fen: `${LEAK_KEY} 2 3`,
    expectedUci: 'f1c4',
    reps: 0,
    lapses: 0,
    ease: 2.5,
    interval: 0,
    due: 0,
  };
  const review = (ts: number, grade: number): ReviewEvent => ({
    ts,
    cardId: card.id,
    openingId: 'it',
    grade,
  });

  it('acknowledges a passing review logged after the last miss', () => {
    expect(leakReviewedSince(leakAt(100), [card], [review(200, 4)])).toBe(true);
  });

  it('stays open on an older review, a failed grade, or no matching card', () => {
    expect(leakReviewedSince(leakAt(300), [card], [review(200, 4)])).toBe(false);
    expect(leakReviewedSince(leakAt(100), [card], [review(200, 0)])).toBe(false);
    expect(leakReviewedSince(leakAt(100), [], [review(200, 4)])).toBe(false);
  });

  it('ignores a passing review on a different expected move at the same position', () => {
    // Another chapter drills f1b5 on the same position: succeeding THAT
    // card says nothing about the move the games actually missed (f1c4).
    const otherTheory: Card = {
      ...card,
      id: `it::it-ch2::${LEAK_KEY}::f1b5`,
      expectedUci: 'f1b5',
    };
    const r: ReviewEvent = { ts: 200, cardId: otherTheory.id, openingId: 'it', grade: 4 };
    expect(leakReviewedSince(leakAt(100), [otherTheory], [r])).toBe(false);
  });

  it('accepts a matching card from another (transposing) opening', () => {
    const foreign: Card = {
      ...card,
      id: `other::other-ch::${LEAK_KEY}::f1c4`,
      openingId: 'other',
    };
    const r: ReviewEvent = { ts: 200, cardId: foreign.id, openingId: 'other', grade: 4 };
    expect(leakReviewedSince(leakAt(100), [foreign], [r])).toBe(true);
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
