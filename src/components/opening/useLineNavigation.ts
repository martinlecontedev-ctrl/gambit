import { useEffect, useMemo, useState } from 'react';
import {
  applyUci,
  chessFromFen,
  fenOf,
  lineToSan,
  positionKey,
  START_FEN,
} from '../../domain/chess';
import { buildPrefixTrie, effectiveParentId } from '../../domain/tree';
import type { Annotation, Nag, Opening } from '../../domain/types';

/**
 * Read-only navigation state over an opening's variation tree: which line is
 * selected, where the cursor sits, and every position-derived value both the
 * overview and the editor need (chessops position, FENs, SANs, annotations,
 * chapter scope). Never writes to storage — mutations stay in the pages.
 *
 * Mount the consuming component with `key={opening.id}` so the `useState`
 * initializers rerun when navigating between openings.
 */
export function useLineNavigation(
  opening: Opening,
  init?: { lineId?: string; ply?: number },
) {
  const initialLine =
    (init?.lineId && opening.lines.find(l => l.id === init.lineId)) ||
    opening.lines[0];
  const [selectedLineId, setSelectedLineId] = useState<string>(initialLine?.id ?? '');
  const [cursorIdx, setCursorIdx] = useState<number>(() => {
    const len = initialLine?.moves.length ?? 0;
    return init?.ply !== undefined ? Math.min(Math.max(0, init.ply), len) : len;
  });

  // Fallback when the selected line disappears (variant deleted, chapter
  // deleted): pick the first remaining line on the next render.
  useEffect(() => {
    if (!opening.lines.find(l => l.id === selectedLineId)) {
      const fallback = opening.lines[0]?.id ?? '';
      setSelectedLineId(fallback);
      setCursorIdx(0);
    }
  }, [opening.lines, selectedLineId]);

  const line = opening.lines.find(l => l.id === selectedLineId);

  /** Chapter the user is currently working in. Drives the per-chapter trie,
   * the visible scoresheet and where new variants land. */
  const currentChapterId = line?.chapterId ?? opening.chapters[0]?.id;
  const currentChapter = opening.chapters.find(c => c.id === currentChapterId);
  /** Starting position the chapter's lines are sequenced from. Lichess study
   * chapters often start past the initial position via `[FEN …]`. */
  const chapterStartFen = currentChapter?.startFen ?? START_FEN;

  const chapterLines = useMemo(
    () =>
      currentChapterId
        ? opening.lines.filter(l => l.chapterId === currentChapterId)
        : [],
    [opening.lines, currentChapterId],
  );

  const chess = useMemo(() => {
    let c = chessFromFen(chapterStartFen);
    const upTo = line?.moves.slice(0, cursorIdx) ?? [];
    for (const m of upTo) c = applyUci(c, m);
    return c;
  }, [line, cursorIdx, chapterStartFen]);

  const trie = useMemo(() => buildPrefixTrie(chapterLines), [chapterLines]);

  const rootLine = useMemo(
    () => chapterLines.find(l => !effectiveParentId(chapterLines, l)),
    [chapterLines],
  );

  // Keyboard navigation through the current line. Skipped when the focus is
  // inside a text input (annotation textarea, folder rename, etc.) so the
  // arrows still type / move the caret normally.
  const lineLength = line?.moves.length ?? 0;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setCursorIdx(c => Math.max(0, c - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCursorIdx(c => Math.min(lineLength, c + 1));
          break;
        case 'Home':
          e.preventDefault();
          setCursorIdx(0);
          break;
        case 'End':
          e.preventDefault();
          setCursorIdx(lineLength);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lineLength]);

  /** SAN sequence of the selected line — sequenced from the chapter's
   * starting FEN so custom-start Lichess chapters resolve correctly. */
  const sansOfSelected = useMemo(
    () => (line ? lineToSan(line.moves, chapterStartFen) : []),
    [line, chapterStartFen],
  );

  /** FEN at each cursor position along the selected line — used to render
   * chip SAN for alternative continuations seen in sibling lines. Honours
   * the chapter's custom starting FEN. */
  const fenAtPosition = useMemo(() => {
    const m = new Map<number, string>();
    let c = chessFromFen(chapterStartFen);
    m.set(0, fenOf(c));
    if (!line) return m;
    for (let i = 0; i < line.moves.length; i++) {
      c = applyUci(c, line.moves[i]);
      m.set(i + 1, fenOf(c));
    }
    return m;
  }, [line, chapterStartFen]);

  const currentFen = useMemo(() => fenOf(chess), [chess]);

  /**
   * Annotations re-indexed by canonical position key, so transpositions and
   * any legacy entries stored under the full FEN all resolve to the same
   * lookup. Conflicts (rare: two old keys for the same position with
   * different fields) are merged with later overriding earlier.
   */
  const annotationsByPositionKey = useMemo(() => {
    const m = new Map<string, Annotation>();
    for (const [k, v] of Object.entries(opening.annotations ?? {})) {
      const pk = positionKey(k);
      const existing = m.get(pk);
      m.set(pk, existing ? { ...existing, ...v } : v);
    }
    return m;
  }, [opening.annotations]);

  const currentAnnotation = annotationsByPositionKey.get(positionKey(currentFen));

  /** NAG per ply index in the current line — fed to the scoresheet so the
   * judgement glyph shows next to the move that earned it. */
  const nagsAlongLine = useMemo(() => {
    const m = new Map<number, Nag>();
    if (!line) return m;
    for (let i = 0; i < line.moves.length; i++) {
      const f = fenAtPosition.get(i + 1);
      if (!f) continue;
      const nag = annotationsByPositionKey.get(positionKey(f))?.nag;
      if (nag !== undefined) m.set(i, nag);
    }
    return m;
  }, [line, fenAtPosition, annotationsByPositionKey]);

  const sortedChapters = useMemo(
    () => [...opening.chapters].sort((a, b) => a.order - b.order),
    [opening.chapters],
  );

  /** Land on a specific line with the cursor at a given ply (variant chip,
   * post-mutation selection). */
  const selectLine = (lineId: string, ply: number) => {
    setSelectedLineId(lineId);
    setCursorIdx(ply);
  };

  /** Jump to a chapter's root line, cursor at the start. */
  const switchToChapter = (chapterId: string) => {
    if (chapterId === currentChapterId) return;
    const chapterLinesInTarget = opening.lines.filter(
      l => l.chapterId === chapterId,
    );
    const root =
      chapterLinesInTarget.find(
        l => !effectiveParentId(chapterLinesInTarget, l),
      ) ?? chapterLinesInTarget[0];
    if (!root) return;
    setSelectedLineId(root.id);
    setCursorIdx(0);
  };

  return {
    line,
    selectedLineId,
    cursorIdx,
    setCursorIdx,
    selectLine,
    switchToChapter,
    currentChapterId,
    currentChapter,
    chapterStartFen,
    sortedChapters,
    chess,
    currentFen,
    trie,
    rootLine,
    sansOfSelected,
    fenAtPosition,
    currentAnnotation,
    nagsAlongLine,
  };
}
