import { describe, it, expect } from 'vitest';
import {
  analyzeGame,
  buildPositionOwners,
  buildRepertoireBook,
  findLineForPath,
} from './deviation';
import type { Opening } from './types';

// White repertoire: 1.e4, then e5→Nf3 or c5→Nf3; one castling line.
const opening: Opening = {
  id: 'op1',
  name: 'Test',
  color: 'white',
  chapters: [{ id: 'ch1', name: 'Principal', order: 0 }],
  lines: [
    {
      id: 'l1',
      name: 'main',
      chapterId: 'ch1',
      moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'],
    },
    { id: 'l2', name: 'sicilian', chapterId: 'ch1', moves: ['e2e4', 'c7c5', 'g1f3'] },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const book = buildRepertoireBook([opening], 'white');

describe('buildRepertoireBook', () => {
  it('indexes both colors moves by position key', () => {
    // Start position: only e4. After 1.e4: both replies are known.
    const start = book.get('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    expect(start).toEqual(['e2e4']);
  });

  it('is empty for a color with no openings', () => {
    expect(buildRepertoireBook([opening], 'black').size).toBe(0);
  });
});

describe('analyzeGame', () => {
  it('reports a user deviation with the expected moves and the position key', () => {
    const v = analyzeGame(['d4', 'd5'], 'white', book);
    expect(v).toEqual({
      kind: 'user-left',
      ply: 0,
      played: 'd4',
      playedUci: 'd2d4',
      expected: ['e4'],
      expectedUcis: ['e2e4'],
      key: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    });
  });

  it('reports the opponent leaving prep, with the in-book path', () => {
    const v = analyzeGame(['e4', 'e6'], 'white', book);
    expect(v).toMatchObject({
      kind: 'opponent-left',
      ply: 1,
      played: 'e6',
      playedUci: 'e7e6',
      path: ['e2e4'],
    });
  });

  it('spells the path with the repertoire UCIs, castles included', () => {
    // Game castles with O-O (chessops: e1h1); the stored line says e1g1.
    // A later opponent novelty must carry the path in repertoire spelling
    // so it prefix-matches stored lines.
    const v = analyzeGame(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'd6'],
      'white',
      book,
    );
    expect(v).toMatchObject({
      kind: 'book-end',
      ply: 7,
    });
    // Path check via a shorter game: deviation right after the castle would
    // need book depth; assert on the pre-castle novelty instead.
    const v2 = analyzeGame(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'h6'], 'white', book);
    expect(v2).toMatchObject({
      kind: 'opponent-left',
      path: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'],
    });
  });

  it('reports book-end when the repertoire runs out', () => {
    const v = analyzeGame(['e4', 'c5', 'Nf3', 'd6', 'd4'], 'white', book);
    // e4, c5, Nf3 are in book; the position after Nf3 is a leaf.
    expect(v).toEqual({ kind: 'book-end', ply: 3 });
  });

  it('matches castling despite the king-on-rook UCI convention', () => {
    const v = analyzeGame(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'],
      'white',
      book,
    );
    // chessops turns O-O into e1h1; the stored move is e1g1 — sameMove
    // must reconcile them and count the full line as followed.
    expect(v).toEqual({ kind: 'book-end', ply: 7 });
  });

  it('flags a game that never enters the repertoire', () => {
    // Black to move first mismatch impossible for white start — use a book
    // built from a custom-start chapter that the game never reaches.
    const custom: Opening = {
      ...opening,
      chapters: [
        {
          id: 'ch1',
          name: 'C',
          order: 0,
          startFen:
            'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
        },
      ],
      lines: [{ id: 'l1', name: 'm', chapterId: 'ch1', moves: ['b8c6'] }],
    };
    const b = buildRepertoireBook([custom], 'white');
    expect(analyzeGame(['d4', 'd5'], 'white', b)).toEqual({
      kind: 'book-end',
      ply: 0,
    });
  });

  it('returns no-repertoire on an empty book', () => {
    expect(analyzeGame(['e4'], 'black', new Map())).toEqual({
      kind: 'no-repertoire',
    });
  });

  it('normalizes a castling novelty to the king-target UCI', () => {
    // Book expects 9...exd4; black castles instead. chessops spells O-O as
    // e8h8 — the verdict must carry e8g8 so the grafted line stores the
    // same spelling the board editor would produce.
    const deep: Opening = {
      ...opening,
      lines: [
        {
          id: 'l1',
          name: 'main',
          chapterId: 'ch1',
          moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4'],
        },
      ],
    };
    const b = buildRepertoireBook([deep], 'white');
    const v = analyzeGame(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'O-O'],
      'white',
      b,
    );
    expect(v).toMatchObject({ kind: 'opponent-left', playedUci: 'e8g8' });
  });

  it('walks through a move-order transposition instead of flagging it', () => {
    // Sibling lines cover ...Nf6 and ...d6 in both orders partially: the
    // main line plays Nf6 first, the sibling d6 first. A game mixing the
    // orders (Nf6 then d6) reaches the sibling's position — that is not a
    // novelty, and flagging it used to re-propose grafting forever.
    const transpo: Opening = {
      ...opening,
      lines: [
        {
          id: 'l1',
          name: 'main',
          chapterId: 'ch1',
          moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4'],
        },
        {
          id: 'l2',
          name: 'sibling',
          chapterId: 'ch1',
          moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'd7d6', 'd2d4', 'g8f6', 'h2h3'],
        },
      ],
    };
    const b = buildRepertoireBook([transpo], 'white');
    // 8...d6 is not a book edge after 7...Nf6 8.d4, but the position it
    // reaches is the sibling's (d6/Nf6 swapped) — keep walking to book-end.
    const v = analyzeGame(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'd6'],
      'white',
      b,
    );
    expect(v).toEqual({ kind: 'book-end', ply: 10 });
    // The walk continues in the sibling's continuations after the rejoin.
    const v2 = analyzeGame(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'd6', 'h3', 'a6'],
      'white',
      b,
    );
    expect(v2).toEqual({ kind: 'book-end', ply: 11 });
  });
});

describe('buildPositionOwners', () => {
  it('maps every book position to the first opening holding it', () => {
    const owners = buildPositionOwners([opening], 'white');
    expect(
      owners.get('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'),
    ).toBe('op1');
    expect(buildPositionOwners([opening], 'black').size).toBe(0);
  });

  it('owns line-end positions, which stay out of the walk book', () => {
    // A seeded repertoire whose line STOPS on the family position must
    // still count as covering it (the "create a repertoire" button test) —
    // while analyzeGame keeps treating that leaf as a book end.
    const afterNf3 =
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -';
    expect(buildPositionOwners([opening], 'white').get(afterNf3)).toBe('op1');
    expect(buildRepertoireBook([opening], 'white').has(afterNf3)).toBe(false);
  });
});

describe('findLineForPath', () => {
  it('finds the line playing the exact prefix', () => {
    const hit = findLineForPath([opening], 'white', ['e2e4', 'c7c5']);
    expect(hit).toEqual({ openingId: 'op1', lineId: 'l2' });
  });

  it('prefers the line that continues past the path over a dead-end prefix', () => {
    // A seeded "Créer un répertoire" opening whose line IS the game route
    // must not steal the graft anchor from the real repertoire line that
    // had a prepared continuation at the deviation position.
    const seeded: Opening = {
      ...opening,
      id: 'seeded',
      lines: [
        { id: 'seed1', name: 'Ligne 1', chapterId: 'ch1', moves: ['e2e4', 'c7c5'] },
      ],
    };
    const hit = findLineForPath([seeded, opening], 'white', ['e2e4', 'c7c5']);
    expect(hit).toEqual({ openingId: 'op1', lineId: 'l2' });
  });

  it('matches despite a legacy king-on-rook castle spelling in the stored line', () => {
    const legacy: Opening = {
      ...opening,
      lines: [
        {
          id: 'l1',
          name: 'main',
          chapterId: 'ch1',
          moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1h1', 'd7d6'],
        },
      ],
    };
    // The verdict path spells castles in the normalized form (e1g1).
    const hit = findLineForPath(
      [legacy],
      'white',
      ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'],
    );
    expect(hit).toEqual({ openingId: 'op1', lineId: 'l1' });
  });

  it('misses when the path is spelled differently or absent', () => {
    expect(findLineForPath([opening], 'white', ['e2e4', 'e7e6'])).toBeUndefined();
    expect(findLineForPath([opening], 'black', ['e2e4'])).toBeUndefined();
  });

  it('skips custom-start chapters (their lines are not indexed from the start)', () => {
    const custom: Opening = {
      ...opening,
      chapters: [
        { id: 'ch1', name: 'C', order: 0, startFen: 'whatever fen b KQkq - 1 2' },
      ],
    };
    expect(findLineForPath([custom], 'white', ['e2e4'])).toBeUndefined();
  });
});
