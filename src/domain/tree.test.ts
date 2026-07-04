import { describe, it, expect } from 'vitest';
import {
  buildPrefixTrie,
  commonPrefixLength,
  continuationsAt,
  effectiveParentId,
  parentForNewVariant,
  segmentLines,
} from './tree';
import type { Line } from './types';

const line = (over: Partial<Line> & Pick<Line, 'id' | 'moves'>): Line => ({
  name: over.id,
  chapterId: 'ch1',
  ...over,
});

describe('commonPrefixLength', () => {
  it('counts the shared leading elements', () => {
    expect(commonPrefixLength(['a', 'b', 'c'], ['a', 'b', 'x'])).toBe(2);
  });
  it('is zero when nothing matches', () => {
    expect(commonPrefixLength(['a'], ['b'])).toBe(0);
  });
  it('caps at the shorter array', () => {
    expect(commonPrefixLength(['a', 'b'], ['a', 'b', 'c'])).toBe(2);
  });
});

describe('effectiveParentId', () => {
  it('honors an explicit parent', () => {
    const child = line({ id: 'c', moves: [], parentLineId: 'p' });
    expect(effectiveParentId([child], child)).toBe('p');
  });

  it('returns undefined for a lone root', () => {
    const root = line({ id: 'r', moves: [] });
    expect(effectiveParentId([root], root)).toBeUndefined();
  });

  it('re-parents legacy extra roots onto the first root of the chapter', () => {
    const r1 = line({ id: 'r1', moves: ['e2e4'] });
    const r2 = line({ id: 'r2', moves: ['d2d4'] });
    expect(effectiveParentId([r1, r2], r2)).toBe('r1');
    expect(effectiveParentId([r1, r2], r1)).toBeUndefined();
  });

  it('never links roots across chapters', () => {
    const a = line({ id: 'a', moves: ['e2e4'], chapterId: 'ch1' });
    const b = line({ id: 'b', moves: ['d2d4'], chapterId: 'ch2' });
    expect(effectiveParentId([a, b], b)).toBeUndefined();
  });
});

describe('parentForNewVariant', () => {
  // Main line: 1.e4 e5 2.Nf3 Nc6 3.Bb5 (Ruy Lopez), as a single root line.
  const main = line({ id: 'main', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] });

  it('returns the line itself when diverging within its own content', () => {
    // Cursor at ply 5 (after Bb5): a divergent move here belongs to `main`.
    expect(parentForNewVariant([main], main, 5).id).toBe('main');
  });

  it('walks up to the parent when diverging before the branch point', () => {
    // Child branches off main at ply 4 (its own move differs at index 3).
    const child = line({
      id: 'child',
      moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6'], // Petrov instead of 3...Nc6
      parentLineId: 'main',
    });
    const lines = [main, child];
    // Cursor at ply 2 on `child` is before child's branch point (3) — a
    // divergent move there must branch off `main`, not `child`.
    expect(parentForNewVariant(lines, child, 2).id).toBe('main');
    // Cursor at ply 4 (== branchPoint+1) stays on `child`.
    expect(parentForNewVariant(lines, child, 4).id).toBe('child');
  });

  it('climbs to the top root when cursor is at ply 0', () => {
    const child = line({
      id: 'child',
      moves: ['e2e4', 'c7c5'],
      parentLineId: 'main',
    });
    expect(parentForNewVariant([main, child], child, 0).id).toBe('main');
  });
});

describe('buildPrefixTrie / continuationsAt', () => {
  const ruy = line({ id: 'ruy', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] });
  const italian = line({ id: 'ita', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'] });
  const petrov = line({ id: 'pet', moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6'] });
  const trie = buildPrefixTrie([ruy, italian, petrov]);

  it('lists every continuation seen at a fork', () => {
    // After 1.e4 e5 2.Nf3 (plyIdx 3) the fork is 2...Nc6 vs 2...Nf6.
    const conts = continuationsAt(trie, ruy, 3);
    const byUci = Object.fromEntries(conts.map(c => [c.uci, c.lineIds.sort()]));
    expect(Object.keys(byUci).sort()).toEqual(['b8c6', 'g8f6']);
    expect(byUci['b8c6']).toEqual(['ita', 'ruy']);
    expect(byUci['g8f6']).toEqual(['pet']);
  });

  it('returns a single continuation where lines still agree', () => {
    expect(continuationsAt(trie, ruy, 0).map(c => c.uci)).toEqual(['e2e4']);
  });

  it('returns nothing past the end of a line', () => {
    expect(continuationsAt(trie, petrov, 10)).toEqual([]);
  });
});

describe('segmentLines', () => {
  it('keeps a single line as one depth-0 segment', () => {
    const main = line({ id: 'm', moves: ['e2e4', 'e7e5', 'g1f3'] });
    expect(segmentLines([main])).toEqual([
      { start: 0, end: 3, moves: ['e2e4', 'e7e5', 'g1f3'], lineIds: ['m'], depth: 0 },
    ]);
  });

  it('splits trunk and branches at the first fork', () => {
    const ruy = line({ id: 'ruy', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] });
    const petrov = line({ id: 'pet', moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6'] });
    const segs = segmentLines([ruy, petrov]);
    expect(segs).toHaveLength(3);
    // Trunk: 1.e4 e5 2.Nf3, shared by both.
    expect(segs[0]).toMatchObject({ start: 0, end: 3, depth: 0 });
    expect(segs[0].lineIds.sort()).toEqual(['pet', 'ruy']);
    // Main continuation first (root line inserted first).
    expect(segs[1]).toMatchObject({
      start: 3,
      end: 5,
      moves: ['b8c6', 'f1b5'],
      lineIds: ['ruy'],
      depth: 1,
    });
    expect(segs[2]).toMatchObject({ start: 3, end: 4, moves: ['g8f6'], depth: 1 });
  });

  it('nests depths across successive forks', () => {
    const a = line({ id: 'a', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] });
    const b = line({ id: 'b', moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6'] });
    const c = line({ id: 'c', moves: ['e2e4', 'c7c5'] });
    const segs = segmentLines([a, b, c]);
    // e4 trunk → (e5 g1f3 at depth 1 → two depth-2 leaves) + (c5 at depth 1).
    expect(segs.map(s => [s.depth, s.moves.join(' ')])).toEqual([
      [0, 'e2e4'],
      [1, 'e7e5 g1f3'],
      [2, 'b8c6'],
      [2, 'g8f6'],
      [1, 'c7c5'],
    ]);
  });

  it('puts first-move alternatives all at depth 0', () => {
    const e4 = line({ id: 'k', moves: ['e2e4', 'e7e5'] });
    const d4 = line({ id: 'q', moves: ['d2d4', 'd7d5'] });
    const segs = segmentLines([e4, d4]);
    expect(segs.map(s => [s.depth, s.start])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('does not split on a line that merely ends early', () => {
    const long = line({ id: 'l', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] });
    const short = line({ id: 's', moves: ['e2e4', 'e7e5'] });
    const segs = segmentLines([long, short]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ start: 0, end: 4 });
    expect(segs[0].lineIds.sort()).toEqual(['l', 's']);
  });
});
