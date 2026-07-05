import { describe, it, expect } from 'vitest';
import { parseGamesNdjson } from './lichessGames';

const game = (over: Record<string, unknown>) =>
  JSON.stringify({
    id: 'abcd1234',
    speed: 'blitz',
    rated: true,
    createdAt: 1700000000000,
    moves: 'e4 e5 Nf3',
    players: {
      white: { user: { name: 'Martin' }, rating: 1900 },
      black: { user: { name: 'Rival' }, rating: 1880 },
    },
    winner: 'white',
    ...over,
  });

describe('parseGamesNdjson', () => {
  it('maps color, opponent and result from the user point of view', () => {
    const [g] = parseGamesNdjson(game({}), 'martin');
    expect(g.userColor).toBe('white');
    expect(g.opponent).toBe('Rival');
    expect(g.opponentRating).toBe(1880);
    expect(g.result).toBe('win');
    expect(g.sans).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('flips result and opponent when the user plays black', () => {
    const [g] = parseGamesNdjson(
      game({
        players: {
          white: { user: { name: 'Rival' }, rating: 2000 },
          black: { user: { name: 'Martin' }, rating: 1900 },
        },
        winner: 'white',
      }),
      'Martin',
    );
    expect(g.userColor).toBe('black');
    expect(g.opponent).toBe('Rival');
    expect(g.result).toBe('loss');
  });

  it('treats no winner as a draw and labels AI opponents', () => {
    const [g] = parseGamesNdjson(
      game({
        winner: undefined,
        players: {
          white: { user: { name: 'Martin' } },
          black: { aiLevel: 5 },
        },
      }),
      'martin',
    );
    expect(g.result).toBe('draw');
    expect(g.opponent).toBe('Stockfish niv. 5');
  });

  it('skips malformed lines and games without the user', () => {
    const body = ['not json', game({ players: { white: { user: { name: 'X' } }, black: { user: { name: 'Y' } } } }), game({})].join('\n');
    const games = parseGamesNdjson(body, 'martin');
    expect(games).toHaveLength(1);
  });
});
