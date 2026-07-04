import type { Line } from './types';

/**
 * Effective parent of a line in the variant tree. Honors the explicit
 * `parentLineId`; for legacy data with multiple roots within the same chapter
 * (e.g. pre-chapter migrations), treats every root past the first as a child
 * of the first root. Roots from other chapters are never linked together —
 * chapters are independent storylines.
 */
export function effectiveParentId(lines: Line[], line: Line): string | undefined {
  if (line.parentLineId) return line.parentLineId;
  const roots = lines.filter(
    l => !l.parentLineId && l.chapterId === line.chapterId,
  );
  if (roots.length <= 1) return undefined;
  if (roots[0].id === line.id) return undefined;
  return roots[0].id;
}

export function commonPrefixLength(a: string[], b: string[]): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  return i;
}

/**
 * Pick the parent line for a variant the user is about to create from
 * `line` at `cursorIdx`. Walks up the tree to whichever ancestor still has
 * its own content at position `cursorIdx - 1`. Positions below a line's
 * branch point belong to its parent, not to itself — so a divergent move
 * played there must branch off the parent, not the current line.
 */
export function parentForNewVariant(
  lines: Line[],
  line: Line,
  cursorIdx: number,
): Line {
  let cur = line;
  if (cursorIdx === 0) {
    // No shared prefix at all; the variant is rooted at the top.
    while (true) {
      const parentId = effectiveParentId(lines, cur);
      const parent = parentId ? lines.find(l => l.id === parentId) : undefined;
      if (!parent) return cur;
      cur = parent;
    }
  }
  while (true) {
    const parentId = effectiveParentId(lines, cur);
    const parent = parentId ? lines.find(l => l.id === parentId) : undefined;
    if (!parent) return cur;
    const branchPoint = commonPrefixLength(cur.moves, parent.moves);
    if (cursorIdx - 1 >= branchPoint) return cur;
    cur = parent;
  }
}

/**
 * Prefix trie over all lines in an opening. Each node holds the set of line
 * IDs that pass through it, so we can detect forks (depth nodes with more
 * than one child) and list every continuation seen at a given depth.
 */
export type TrieNode = {
  children: Map<string, TrieNode>;
  lineIds: Set<string>;
};

export function buildPrefixTrie(lines: Line[]): TrieNode {
  const root: TrieNode = { children: new Map(), lineIds: new Set() };
  for (const line of lines) {
    root.lineIds.add(line.id);
    let node = root;
    for (const move of line.moves) {
      let next = node.children.get(move);
      if (!next) {
        next = { children: new Map(), lineIds: new Set() };
        node.children.set(move, next);
      }
      next.lineIds.add(line.id);
      node = next;
    }
  }
  return root;
}

export type Segment = {
  /** Absolute ply range `[start, end)` the segment covers. */
  start: number;
  end: number;
  /** UCI moves of the segment — identical in every line passing through. */
  moves: string[];
  /** Lines whose sequence enters the segment (early-ending lines may stop
   * before its tail — clamp per line when mapping windows back). */
  lineIds: string[];
  /** Nesting level: 0 = trunk (or top-level alternatives when the lines
   * fork on the very first move), +1 under each fork. */
  depth: number;
};

/**
 * Decompose a chapter's lines into linear segments: the trunk shared by all
 * variants up to the first fork, then one segment per branch between
 * consecutive forks. Depth-first, main continuation first (trie insertion
 * order — the root line is inserted first). Every ply of every line belongs
 * to exactly one segment.
 */
export function segmentLines(lines: Line[]): Segment[] {
  const out: Segment[] = [];

  const walkSegment = (
    firstUci: string,
    firstNode: TrieNode,
    startPly: number,
    depth: number,
  ) => {
    const moves = [firstUci];
    const lineIds = [...firstNode.lineIds];
    let cur = firstNode;
    let ply = startPly + 1;
    while (cur.children.size === 1) {
      const [uci, child] = [...cur.children][0];
      moves.push(uci);
      cur = child;
      ply++;
    }
    out.push({ start: startPly, end: ply, moves, lineIds, depth });
    for (const [uci, child] of cur.children) {
      walkSegment(uci, child, ply, depth + 1);
    }
  };

  const root = buildPrefixTrie(lines);
  // A single child = a real trunk at depth 0; an immediate fork = top-level
  // alternatives, all at depth 0.
  for (const [uci, child] of root.children) {
    walkSegment(uci, child, 0, 0);
  }
  return out;
}

export type Continuation = {
  uci: string;
  /** All lines that contain this continuation at the queried depth. */
  lineIds: string[];
};

/** Possible next moves after playing `line.moves[0..plyIdx-1]`. */
export function continuationsAt(trie: TrieNode, line: Line, plyIdx: number): Continuation[] {
  let node = trie;
  for (let i = 0; i < plyIdx; i++) {
    const next = node.children.get(line.moves[i]);
    if (!next) return [];
    node = next;
  }
  const out: Continuation[] = [];
  for (const [uci, child] of node.children) {
    out.push({ uci, lineIds: [...child.lineIds] });
  }
  return out;
}
