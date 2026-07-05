import { describe, it, expect } from 'vitest';
import { explorerUrl, parseExplorerResponse } from './explorer';
import { START_FEN } from './chess';

describe('explorerUrl', () => {
  it('queries the lichess database with speed and rating filters', () => {
    const url = new URL(explorerUrl(START_FEN, 'lichess'));
    expect(url.origin + url.pathname).toBe('https://explorer.lichess.org/lichess');
    expect(url.searchParams.get('fen')).toBe(START_FEN);
    expect(url.searchParams.get('speeds')).toBe('blitz,rapid,classical');
    expect(url.searchParams.get('ratings')).toBe('1800,2000,2200,2500');
    expect(url.searchParams.get('topGames')).toBe('0');
  });

  it('queries masters without lichess-only filters', () => {
    const url = new URL(explorerUrl(START_FEN, 'masters'));
    expect(url.origin + url.pathname).toBe('https://explorer.lichess.org/masters');
    expect(url.searchParams.get('speeds')).toBeNull();
    expect(url.searchParams.get('ratings')).toBeNull();
  });
});

describe('parseExplorerResponse', () => {
  it('maps totals and per-move stats', () => {
    const r = parseExplorerResponse({
      white: 100,
      draws: 50,
      black: 30,
      moves: [
        { uci: 'e2e4', san: 'e4', white: 60, draws: 30, black: 10 },
        { uci: 'd2d4', san: 'd4', white: 40, draws: 20, black: 20 },
      ],
    });
    expect(r.total).toBe(180);
    expect(r.moves).toHaveLength(2);
    expect(r.moves[0]).toEqual({
      uci: 'e2e4',
      san: 'e4',
      white: 60,
      draws: 30,
      black: 10,
      total: 100,
    });
  });

  it('tolerates missing fields and malformed moves', () => {
    const r = parseExplorerResponse({
      moves: [{ san: 'e4' }, { uci: 'e2e4', san: 'e4', white: 'x' }],
    });
    expect(r.total).toBe(0);
    // The first move has no uci and is dropped; the second survives with
    // its non-numeric field zeroed.
    expect(r.moves).toHaveLength(1);
    expect(r.moves[0].white).toBe(0);
  });
});
