import { describe, it, expect } from 'vitest';
import { applyUci, chessFromFen, fenOf, positionKey, START_FEN } from './chess';
import { exportToPgn, importFromPgn, importLichessStudy } from './pgn';
import type { Opening } from './types';

const keyAfter = (ucis: string[]): string => {
  let c = chessFromFen(START_FEN);
  for (const u of ucis) c = applyUci(c, u);
  return positionKey(fenOf(c));
};

const baseOpening = (over: Partial<Opening>): Opening => ({
  id: 'op1',
  name: 'Italienne',
  color: 'white',
  chapters: [{ id: 'ch1', name: 'Principal', order: 0 }],
  lines: [
    {
      id: 'l1',
      name: 'main',
      chapterId: 'ch1',
      moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('exportToPgn', () => {
  it('emits the mainline with the opening name as Event', () => {
    const pgn = exportToPgn(baseOpening({}));
    expect(pgn).toContain('[Event "Italienne"]');
    expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6 3. Bc4');
  });

  it('emits one game per chapter, named Lichess-study style', () => {
    const pgn = exportToPgn(
      baseOpening({
        chapters: [
          { id: 'ch1', name: 'Giuoco Piano', order: 0 },
          { id: 'ch2', name: 'Fritz', order: 1 },
        ],
        lines: [
          { id: 'l1', name: 'main', chapterId: 'ch1', moves: ['e2e4', 'e7e5'] },
          { id: 'l2', name: 'main', chapterId: 'ch2', moves: ['d2d4', 'd7d5'] },
        ],
      }),
    );
    expect(pgn).toContain('[Event "Italienne: Giuoco Piano"]');
    expect(pgn).toContain('[Event "Italienne: Fritz"]');
    expect(pgn).toContain('1. e4 e5');
    expect(pgn).toContain('1. d4 d5');
  });

  it('anchors custom-start chapters on FEN/SetUp headers', () => {
    // Position after 1.e4 e5 2.Nf3 — black to move.
    const startFen =
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    const pgn = exportToPgn(
      baseOpening({
        chapters: [
          { id: 'ch1', name: 'A', order: 0 },
          { id: 'ch2', name: 'Custom', order: 1, startFen },
        ],
        lines: [
          { id: 'l1', name: 'main', chapterId: 'ch1', moves: ['e2e4'] },
          { id: 'l2', name: 'main', chapterId: 'ch2', moves: ['b8c6', 'f1c4'] },
        ],
      }),
    );
    expect(pgn).toContain(`[FEN "${startFen}"]`);
    expect(pgn).toContain('[SetUp "1"]');
    // Moves must be SAN-ified against the custom start, black to move first.
    expect(pgn).toContain('2... Nc6 3. Bc4');
  });

  it('emits variants as parenthesized sidelines with their annotations', () => {
    const pgn = exportToPgn(
      baseOpening({
        lines: [
          { id: 'l1', name: 'main', chapterId: 'ch1', moves: ['e2e4', 'e7e5', 'g1f3'] },
          {
            id: 'l2',
            name: 'var',
            chapterId: 'ch1',
            parentLineId: 'l1',
            moves: ['e2e4', 'c7c5'],
          },
        ],
        annotations: {
          // After 1.e4 c5 — comment must ride along inside the variation.
          [keyAfter(['e2e4', 'c7c5'])]: { comment: 'Sicilienne', nag: 5 },
        },
      }),
    );
    expect(pgn).toContain('( 1... c5 $5 { Sicilienne } )');
  });

  it('round-trips a multi-chapter opening through the study importer', () => {
    const source = baseOpening({
      chapters: [
        { id: 'ch1', name: 'Giuoco Piano', order: 0 },
        { id: 'ch2', name: 'Fritz', order: 1 },
      ],
      lines: [
        { id: 'l1', name: 'main', chapterId: 'ch1', moves: ['e2e4', 'e7e5', 'g1f3'] },
        { id: 'l2', name: 'main', chapterId: 'ch2', moves: ['d2d4', 'd7d5', 'c2c4'] },
      ],
    });
    const { opening } = importLichessStudy(exportToPgn(source), 'white');
    expect(opening.name).toBe('Italienne');
    expect(opening.chapters.map(c => c.name)).toEqual(['Giuoco Piano', 'Fritz']);
    expect(opening.lines.map(l => l.moves)).toEqual([
      ['e2e4', 'e7e5', 'g1f3'],
      ['d2d4', 'd7d5', 'c2c4'],
    ]);
  });
});

describe('importFromPgn', () => {
  it('parses one opening per game with moves, NAGs and arrows', () => {
    const pgn = `[Event "Test"]

1. e4 $1 { bon centre [%cal Ge2e4] } e5 *
`;
    const results = importFromPgn(pgn, 'black');
    expect(results).toHaveLength(1);
    const { opening } = results[0];
    expect(opening.color).toBe('black');
    expect(opening.lines[0].moves).toEqual(['e2e4', 'e7e5']);
    const ann = Object.values(opening.annotations ?? {});
    expect(ann.some(a => a.nag === 1 && a.comment === 'bon centre')).toBe(true);
    expect(
      ann.some(a => a.arrows?.some(ar => ar.orig === 'e2' && ar.dest === 'e4')),
    ).toBe(true);
  });

  it('turns PGN variations into child lines sharing the prefix', () => {
    const pgn = `[Event "Test"]

1. e4 e5 ( 1... c5 2. Nf3 ) 2. Nf3 *
`;
    const { opening } = importFromPgn(pgn, 'white')[0];
    expect(opening.lines).toHaveLength(2);
    const [main, variant] = opening.lines;
    expect(main.moves).toEqual(['e2e4', 'e7e5', 'g1f3']);
    expect(variant.moves).toEqual(['e2e4', 'c7c5', 'g1f3']);
    expect(variant.parentLineId).toBe(main.id);
  });
});
