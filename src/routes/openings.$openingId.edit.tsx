import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Chess } from 'chessops/chess';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
import { FigurineSan } from '../components/FigurineSan';
import { Modal } from '../components/Modal';
import { NagSquareBadge } from '../components/NagSquareBadge';
import {
  applyUci,
  chessFromFen,
  fenOf,
  legalDests,
  lineToSan,
  positionKey,
  sameMove,
  START_FEN,
  turnColor,
  uciFromMove,
  uciToSanAt,
} from '../domain/chess';
import { engine, type EngineResult } from '../domain/engine';
import { NAG_COLORS, NAG_LABELS, NAG_ORDER, NAG_SYMBOLS } from '../domain/nag';
import { recognizeOpening, type Opening as RecognizedOpening } from '../domain/openings-db';
import { exportToPgn } from '../domain/pgn';
import {
  buildPrefixTrie,
  continuationsAt,
  effectiveParentId,
  parentForNewVariant,
  segmentLines,
} from '../domain/tree';
import type {
  Annotation,
  ArrowBrush,
  ArrowDef,
  Chapter,
  Color,
  Line,
  Nag,
  Opening,
} from '../domain/types';
import { cardsRepo, openingsRepo } from '../storage/repository';
import { useStored } from '../storage/store';

const KNOWN_BRUSHES: ArrowBrush[] = [
  'green',
  'red',
  'blue',
  'yellow',
  'paleGreen',
  'paleRed',
  'paleBlue',
  'paleGrey',
];
const isKnownBrush = (b: string | undefined): b is ArrowBrush =>
  b !== undefined && (KNOWN_BRUSHES as string[]).includes(b);

export const Route = createFileRoute('/openings/$openingId/edit')({ component: EditOpening });

function EditOpening() {
  const { openingId } = Route.useParams();
  const opening = useStored(() => openingsRepo.get(openingId));
  if (!opening) return <NotFound />;
  return <EditOpeningInner key={opening.id} opening={opening} />;
}

function NotFound() {
  return (
    <main className="mx-auto max-w-md px-10 py-16 text-center text-ink-soft">
      Ouverture introuvable.{' '}
      <Link to="/" className="font-semibold text-accent underline">
        Retour
      </Link>
    </main>
  );
}

function EditOpeningInner({ opening }: { opening: Opening }) {
  const navigate = useNavigate();
  const [selectedLineId, setSelectedLineId] = useState<string>(opening.lines[0]?.id ?? '');
  const [cursorIdx, setCursorIdx] = useState<number>(opening.lines[0]?.moves.length ?? 0);

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
    let chess = chessFromFen(chapterStartFen);
    m.set(0, fenOf(chess));
    if (!line) return m;
    for (let i = 0; i < line.moves.length; i++) {
      chess = applyUci(chess, line.moves[i]);
      m.set(i + 1, fenOf(chess));
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

  // --- Opening recognition --------------------------------------------------
  // Position-based, like lichess/chess.com: we walk the current line up to
  // the cursor and surface the deepest ECO entry encountered. Position-keyed
  // lookup means transpositions resolve to the same name.
  const [recognizedOpening, setRecognizedOpening] = useState<RecognizedOpening | null>(null);
  useEffect(() => {
    if (!line) {
      setRecognizedOpening(null);
      return;
    }
    let cancelled = false;
    recognizeOpening(line.moves, cursorIdx, chapterStartFen).then(found => {
      if (!cancelled) setRecognizedOpening(found);
    });
    return () => {
      cancelled = true;
    };
  }, [line, cursorIdx, chapterStartFen]);

  // --- Stockfish engine ----------------------------------------------------
  // Toggle persists across reloads. The Worker is module-level (single
  // instance for the whole app) and torn down when toggled off or the editor
  // unmounts, to free its ~50MB working set.
  const [engineEnabled, setEngineEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gambit.engine.enabled') === '1';
    } catch {
      return false;
    }
  });
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  const toggleEngine = () => {
    setEngineEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem('gambit.engine.enabled', next ? '1' : '0');
      } catch {
        /* ignored */
      }
      return next;
    });
  };

  // Engine queue: chains analyses via a Promise so only ONE is in flight at
  // a time. Rapid navigation just keeps overwriting `wantedFen` — obsolete
  // chain tasks short-circuit on wake-up without firing engine.analyze. This
  // is the only design that survives discrete arrow taps (>200ms apart),
  // which a setTimeout debounce can't coalesce.
  const wantedFenRef = useRef<string | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    // React.StrictMode fires this effect's cleanup once on the development
    // double-invoke. Without re-setting `mountedRef.current = true` on the
    // real remount, every subsequent chain task short-circuits on the
    // `!mountedRef.current` guard and the engine never updates the UI.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      engine.stop();
    };
  }, []);

  const requestEngine = (fen: string | null) => {
    wantedFenRef.current = fen;
    const myWanted = fen;
    chainRef.current = chainRef.current.then(async () => {
      if (!mountedRef.current) return;
      if (wantedFenRef.current !== myWanted) return;
      if (myWanted === null) {
        setIsThinking(false);
        return;
      }
      try {
        const result = await engine.analyze(myWanted, {
          multiPv: 3,
          depth: 18,
          movetimeMs: 500,
        });
        if (!mountedRef.current) return;
        if (result.lines.length > 0 && wantedFenRef.current === myWanted) {
          setEngineResult(result);
        }
      } catch {
        /* engine errored; next request will reboot */
      }
      if (mountedRef.current && wantedFenRef.current === myWanted) {
        setIsThinking(false);
      }
    });
  };

  useEffect(() => {
    if (!engineEnabled) {
      engine.stop();
      setEngineResult(null);
      setIsThinking(false);
      requestEngine(null);
      return;
    }
    if (chess.isEnd()) {
      setIsThinking(false);
      requestEngine(null);
      return;
    }
    setIsThinking(true);
    requestEngine(currentFen);
  }, [engineEnabled, currentFen, chess]);

  const engineAutoShapes: DrawShape[] = useMemo(() => {
    if (!engineEnabled || !engineResult || engineResult.fen !== currentFen) {
      return [];
    }
    return engineResult.lines.map((l, i) => ({
      orig: l.uci.slice(0, 2) as Key,
      dest: l.uci.slice(2, 4) as Key,
      brush: i === 0 ? 'paleBlue' : 'paleGrey',
    }));
  }, [engineEnabled, engineResult, currentFen]);

  const evalText = useMemo<string | null>(() => {
    if (!engineEnabled) return null;
    if (!engineResult || engineResult.fen !== currentFen) return null;
    const best = engineResult.lines[0];
    if (!best) return null;
    // chessops/Stockfish report cp/mate from side-to-move POV. Flip to
    // white-POV so the sign stays stable across plies.
    const sign = turnColor(chess) === 'white' ? 1 : -1;
    if (best.mate !== undefined) {
      const m = best.mate * sign;
      return m > 0 ? `M${m}` : `−M${-m}`;
    }
    const score = ((best.cp ?? 0) * sign) / 100;
    return (score >= 0 ? '+' : '') + score.toFixed(2);
  }, [engineEnabled, engineResult, currentFen, chess]);

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

  /**
   * Apply a mutation against the **freshest** opening from storage rather
   * than the closure copy. Without this, two writes triggered in quick
   * succession (e.g. arrow drawn → move played) race on the closure-captured
   * opening and the later save silently drops the earlier change.
   */
  const updateOpening = (mutator: (latest: Opening) => Opening) => {
    const latest = openingsRepo.get(opening.id);
    if (!latest) return;
    openingsRepo.save({ ...mutator(latest), updatedAt: Date.now() });
  };

  /**
   * Apply a partial patch to the annotation at `fen`, indexed by the
   * canonical position key. Any legacy entries that resolve to the same
   * position key (e.g. transpositions that were stored under the full FEN)
   * are folded into the merged result and dropped — so the storage
   * progressively collapses to one entry per position. The merge happens
   * against the freshest opening read from the repo, not against the
   * caller's closure, so concurrent writers updating different fields of
   * the same annotation can't clobber each other.
   */
  const updateAnnotation = (fen: string, patch: Partial<Annotation>) => {
    const key = positionKey(fen);
    updateOpening(latest => {
      const next: Record<string, Annotation> = {};
      let existing: Annotation = {};
      for (const [k, v] of Object.entries(latest.annotations ?? {})) {
        if (positionKey(k) === key) {
          existing = { ...existing, ...v };
        } else {
          next[k] = v;
        }
      }
      const merged: Annotation = { ...existing, ...patch };
      const isEmpty =
        (!merged.comment || !merged.comment.trim()) &&
        merged.nag === undefined &&
        (!merged.arrows || merged.arrows.length === 0);
      if (!isEmpty) next[key] = merged;
      return { ...latest, annotations: next };
    });
  };

  /** Pending "create a new chapter" prompt. Non-null means the modal is
   * open: `seedMoves` is what the new chapter's root line will hold (empty
   * for manual creation, or the full move sequence up to a forced fork);
   * `defaultName` is what we prefill into the name input. */
  const [chapterModal, setChapterModal] = useState<{
    seedMoves: string[];
    defaultName: string;
  } | null>(null);

  const playMove = (uci: string) => {
    if (!line) return;
    if (line.moves[cursorIdx] && sameMove(chess, line.moves[cursorIdx], uci)) {
      setCursorIdx(cursorIdx + 1);
      return;
    }
    // Resolve everything against the freshest opening to avoid clobbering a
    // sibling mutation (e.g. arrows just persisted by drawable.onChange).
    const latest = openingsRepo.get(opening.id);
    if (!latest) return;
    const latestLine = latest.lines.find(l => l.id === line.id);
    if (!latestLine) return;

    if (cursorIdx === latestLine.moves.length) {
      openingsRepo.save({
        ...latest,
        lines: latest.lines.map(l =>
          l.id === latestLine.id ? { ...l, moves: [...l.moves, uci] } : l,
        ),
        updatedAt: Date.now(),
      });
      setCursorIdx(cursorIdx + 1);
      return;
    }

    const prefix = latestLine.moves.slice(0, cursorIdx);
    // Siblings only count within the same chapter — switching to a "sibling"
    // line from another chapter would silently jump the user out of their
    // current storyline.
    const existing = latest.lines.find(
      l =>
        l.id !== latestLine.id &&
        l.chapterId === latestLine.chapterId &&
        l.moves.length > cursorIdx &&
        l.moves[cursorIdx] === uci &&
        prefix.every((m, i) => l.moves[i] === m),
    );
    if (existing) {
      setSelectedLineId(existing.id);
      setCursorIdx(cursorIdx + 1);
      return;
    }

    // A divergent move played on the user's own colour means they're picking
    // a different repertoire choice — that needs to live in its own chapter
    // so the SRS doesn't end up with two contradictory cards for the same
    // position. Stash the move and pop the naming modal; nothing is written
    // until the user confirms. The suggested name combines the recognized
    // ECO name at the divergence position with the SAN of the new move,
    // e.g. "King's Knight Opening: Normal Variation 3. Nc3"; the user just
    // hits Enter for the common case. Falls back to the current chapter
    // name when the position isn't in the ECO dataset.
    if (turnColor(chess) === opening.color) {
      // chess.fullmoves + turnColor(chess) reflect the real move number and
      // side at the current position even when the chapter started past the
      // initial position (custom Lichess FEN).
      const moveNum = chess.fullmoves;
      const isWhite = turnColor(chess) === 'white';
      const san = uciToSanAt(currentFen, uci);
      const moveLabel = isWhite ? `${moveNum}. ${san}` : `${moveNum}... ${san}`;
      const fallbackStem =
        latest.chapters.find(c => c.id === latestLine.chapterId)?.name ?? '';
      const seedMoves = [...prefix, uci];
      // Resolve the ECO name at the divergence position HERE instead of
      // reading `recognizedOpening`: this handler lives in the chessground
      // config closure, which doesn't rebuild when the recognition state
      // lands — reading it would suggest the name of a stale position. The
      // dataset chunk is already loaded (the recognition effect ran on
      // mount), so the modal still opens instantly.
      void recognizeOpening(seedMoves, prefix.length, chapterStartFen).then(
        found => {
          const stem = found?.name ?? fallbackStem;
          setChapterModal({
            seedMoves,
            defaultName: stem ? `${stem} ${moveLabel}` : moveLabel,
          });
        },
      );
      return;
    }

    // Opponent-side divergence: still just a variant in the current chapter.
    const parent = parentForNewVariant(
      latest.lines.filter(l => l.chapterId === latestLine.chapterId),
      latestLine,
      cursorIdx,
    );
    const variant: Line = {
      id: crypto.randomUUID(),
      name: 'Variante',
      chapterId: latestLine.chapterId,
      parentLineId: parent.id,
      moves: [...prefix, uci],
    };
    openingsRepo.save({
      ...latest,
      lines: [...latest.lines, variant],
      updatedAt: Date.now(),
    });
    setSelectedLineId(variant.id);
    setCursorIdx(prefix.length + 1);
  };

  /** Commit the pending "new chapter" prompt: append a fresh Chapter + a root
   * Line seeded with whatever moves the modal carried, then jump the cursor
   * into the new chapter. */
  const confirmNewChapter = (name: string) => {
    if (!chapterModal) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const latest = openingsRepo.get(opening.id);
    if (!latest) {
      setChapterModal(null);
      return;
    }
    // A FORCED fork on a custom-start chapter (e.g. user diverges inside a
    // Scotch line that already begins after `3.d4`) inherits the starting
    // FEN — the seedMoves are sequenced from there and need to replay
    // correctly. A MANUAL "+ Nouveau chapitre" always resets to the
    // standard initial position so the user gets a fresh board ready for
    // their colour to move; otherwise inheriting a black-to-move custom
    // FEN would lock the board when the user expects to start fresh.
    const isForcedFork = chapterModal.seedMoves.length > 0;
    const inheritedStartFen = isForcedFork ? currentChapter?.startFen : undefined;
    const chapter: Chapter = {
      id: crypto.randomUUID(),
      name: trimmed,
      order: latest.chapters.length,
      ...(inheritedStartFen ? { startFen: inheritedStartFen } : {}),
    };
    const rootLine: Line = {
      id: crypto.randomUUID(),
      name: 'Ligne principale',
      chapterId: chapter.id,
      parentLineId: undefined,
      moves: [...chapterModal.seedMoves],
    };
    openingsRepo.save({
      ...latest,
      chapters: [...latest.chapters, chapter],
      lines: [...latest.lines, rootLine],
      updatedAt: Date.now(),
    });
    setSelectedLineId(rootLine.id);
    setCursorIdx(rootLine.moves.length);
    setChapterModal(null);
  };

  const config: Config = useMemo(() => {
    const lastMoveUci = cursorIdx > 0 && line ? line.moves[cursorIdx - 1] : undefined;
    const tc = turnColor(chess);
    const storedArrows: DrawShape[] =
      currentAnnotation?.arrows?.map(a => ({
        orig: a.orig as Key,
        dest: a.dest as Key | undefined,
        brush: a.brush,
      })) ?? [];
    return {
      fen: fenOf(chess),
      orientation: opening.color,
      turnColor: tc,
      lastMove: lastMoveUci
        ? [lastMoveUci.slice(0, 2) as Key, lastMoveUci.slice(2, 4) as Key]
        : undefined,
      movable: {
        free: false,
        color: tc,
        dests: legalDests(chess),
        events: {
          after: (orig: Key, dest: Key) => {
            const uci = uciFromMove(chess, orig, dest);
            playMove(uci);
          },
        },
      },
      animation: { enabled: true, duration: 200 },
      draggable: { showGhost: true },
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: true,
        // chessground's default fires onChange([]) when the user grabs a
        // movable piece, which would silently wipe the position's arrows
        // before we even get to persist the move.
        eraseOnMovablePieceClick: false,
        shapes: storedArrows,
        // Engine suggestions live here so they never trigger onChange and
        // never get folded into the persisted annotation arrows.
        autoShapes: engineAutoShapes,
        onChange: (shapes: DrawShape[]) => {
          const arrows: ArrowDef[] = shapes
            .filter(s => isKnownBrush(s.brush))
            .map(s => ({
              orig: s.orig as string,
              dest: s.dest as string | undefined,
              brush: s.brush as ArrowBrush,
            }));
          updateAnnotation(currentFen, { arrows });
        },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, opening, line, cursorIdx, selectedLineId, currentAnnotation, currentFen, engineAutoShapes]);

  /** Delete a line and re-parent its children to its own parent (no orphans). */
  const deleteLine = (id: string) => {
    updateOpening(latest => {
      const deleted = latest.lines.find(l => l.id === id);
      if (!deleted) return latest;
      return {
        ...latest,
        lines: latest.lines
          .filter(l => l.id !== id)
          .map(l =>
            l.parentLineId === id ? { ...l, parentLineId: deleted.parentLineId } : l,
          ),
      };
    });
  };

  const truncateAtCursor = () => {
    if (!line) return;
    updateOpening(latest => ({
      ...latest,
      lines: latest.lines.map(l =>
        l.id === selectedLineId ? { ...l, moves: l.moves.slice(0, cursorIdx) } : l,
      ),
    }));
  };

  const removeOpening = () => {
    if (!confirm('Supprimer cette ouverture ?')) return;
    openingsRepo.delete(opening.id);
    navigate({ to: '/' });
  };

  const canDeleteVariant = !!line && line.id !== rootLine?.id;
  const [exportOpen, setExportOpen] = useState(false);

  const sortedChapters = useMemo(
    () => [...opening.chapters].sort((a, b) => a.order - b.order),
    [opening.chapters],
  );

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

  // --- Chapter rename / delete --------------------------------------------
  const [renamingChapterId, setRenamingChapterId] = useState<string | undefined>();
  const [chapterRenameDraft, setChapterRenameDraft] = useState('');

  // --- Per-chapter review window --------------------------------------------
  const [rangeChapterId, setRangeChapterId] = useState<string | undefined>();
  const rangeChapter = rangeChapterId
    ? opening.chapters.find(c => c.id === rangeChapterId)
    : undefined;

  /** Persist the windows drafted in the modal. `undefined` clears a line's
   * windows (JSON.stringify drops the undefined key on write). */
  const saveReviewRanges = (
    chapterId: string,
    ranges: Map<string, { start: number; end?: number }[] | undefined>,
  ) => {
    updateOpening(latest => ({
      ...latest,
      lines: latest.lines.map(l =>
        l.chapterId === chapterId && ranges.has(l.id)
          ? { ...l, reviewRanges: ranges.get(l.id) }
          : l,
      ),
    }));
  };

  const submitChapterRename = (chapterId: string) => {
    const trimmed = chapterRenameDraft.trim();
    setRenamingChapterId(undefined);
    setChapterRenameDraft('');
    if (!trimmed) return;
    updateOpening(latest => ({
      ...latest,
      chapters: latest.chapters.map(c =>
        c.id === chapterId ? { ...c, name: trimmed } : c,
      ),
    }));
  };

  const deleteChapter = (chapter: Chapter) => {
    const latest = openingsRepo.get(opening.id);
    if (!latest) return;
    if (latest.chapters.length <= 1) {
      alert("Impossible de supprimer le dernier chapitre d'une ouverture.");
      return;
    }
    const linesInChapter = latest.lines.filter(l => l.chapterId === chapter.id);
    const message =
      `Supprimer le chapitre "${chapter.name}" ?` +
      (linesInChapter.length > 0
        ? `\n\n⚠️  ${linesInChapter.length} ligne${
            linesInChapter.length > 1 ? 's' : ''
          } et toutes les cartes de révision liées seront supprimées.`
        : '') +
      `\n\nCette action est définitive.`;
    if (!confirm(message)) return;
    openingsRepo.save({
      ...latest,
      chapters: latest.chapters.filter(c => c.id !== chapter.id),
      lines: latest.lines.filter(l => l.chapterId !== chapter.id),
      updatedAt: Date.now(),
    });
    cardsRepo.dropWhere(
      c => c.openingId === opening.id && c.chapterId === chapter.id,
    );
    // The selected-line useEffect will pick the first remaining line on the
    // next render if we just deleted the current chapter.
  };

  const navTotal = line?.moves.length ?? 0;
  const navPct = navTotal ? (cursorIdx / navTotal) * 100 : 0;

  return (
    <main className="mx-auto max-w-325 px-10 pb-17.5 pt-4">
      <div className="mb-4 grid grid-cols-[240px_1fr_350px] items-center gap-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-meta transition hover:text-ink"
        >
          ← Retour
        </Link>
        <div className="flex items-baseline gap-5">
          <h1 className="min-w-0 truncate text-[28px] font-extrabold tracking-[-0.02em]">
            {opening.name}
          </h1>
          <p className="shrink-0 whitespace-nowrap text-sm text-meta">
            {opening.color === 'white' ? 'Blancs' : 'Noirs'} ·{' '}
            {opening.lines.length} ligne{opening.lines.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-[240px_1fr_350px] items-start gap-8">
      <aside className="flex flex-col gap-2">
        <h2 className="mx-1 mb-3.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-ink-muted">
          Chapitres
        </h2>
        <ul className="flex flex-col gap-1.5">
          {sortedChapters.map(c => (
            <li key={c.id}>
              <ChapterItem
                chapter={c}
                active={c.id === currentChapterId}
                canDelete={opening.chapters.length > 1}
                hasCustomRange={opening.lines.some(
                  l => l.chapterId === c.id && l.reviewRanges !== undefined,
                )}
                renaming={renamingChapterId === c.id}
                renameDraft={chapterRenameDraft}
                onSelect={() => switchToChapter(c.id)}
                onDefineReview={() => setRangeChapterId(c.id)}
                onRenameStart={() => {
                  setRenamingChapterId(c.id);
                  setChapterRenameDraft(c.name);
                }}
                onRenameChange={setChapterRenameDraft}
                onRenameSubmit={() => submitChapterRename(c.id)}
                onRenameCancel={() => {
                  setRenamingChapterId(undefined);
                  setChapterRenameDraft('');
                }}
                onDelete={() => deleteChapter(c)}
              />
            </li>
          ))}
        </ul>
        <button
          onClick={() => setChapterModal({ seedMoves: [], defaultName: '' })}
          className="mt-1 w-full rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-[13.5px] font-semibold text-meta transition hover:border-accent hover:text-accent"
        >
          + Nouveau chapitre
        </button>
      </aside>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <EngineToggle
            enabled={engineEnabled}
            isThinking={isThinking}
            evalText={evalText}
            onToggle={toggleEngine}
          />
          <div className="flex gap-2.5">
            <button
              onClick={removeOpening}
              className="h-10 rounded-[10px] border border-danger-border bg-danger-soft px-3.75 text-[13.5px] font-semibold text-danger-text transition hover:brightness-[0.98]"
            >
              Supprimer
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="h-10 rounded-[10px] border border-line-strong bg-surface px-3.75 text-[13.5px] font-semibold text-ink transition hover:bg-surface-high"
            >
              Exporter
            </button>
            <Link
              to="/openings/$openingId/study"
              params={{ openingId: opening.id }}
              search={{ program: false }}
              className="btn-accent flex h-10 items-center rounded-[10px] px-3.75 text-[13.5px] font-semibold"
            >
              Réviser
            </Link>
          </div>
        </div>
        {/* ECO + recognized name. Always rendered (`invisible` fallback) so
            its appearance never shifts the board below. */}
        <div className="flex items-center gap-2.5">
            <p
              className={`min-w-0 flex-1 truncate text-[13.5px] text-meta ${
                recognizedOpening ? '' : 'invisible'
              }`}
              aria-hidden={recognizedOpening ? undefined : true}
            >
              <span className="mr-2 rounded-md border border-line-strong bg-track px-2 py-0.75 text-[11px] font-bold tracking-[0.06em] text-ink-soft">
                {recognizedOpening?.eco ?? 'A00'}
              </span>
              <span className="italic">{recognizedOpening?.name ?? ' '}</span>
            </p>
            <YoutubeSearchButton opening={recognizedOpening} color={opening.color} />
          </div>

        <div className="w-132 max-w-full space-y-3">
          <div className="relative">
            {engineEnabled && (
              <EvalBar
                result={engineResult}
                currentFen={currentFen}
                chess={chess}
              />
            )}
            <Chessboard config={config} />
            {currentAnnotation?.nag !== undefined &&
              cursorIdx > 0 &&
              line &&
              line.moves[cursorIdx - 1] && (
                <NagSquareBadge
                  nag={currentAnnotation.nag}
                  square={line.moves[cursorIdx - 1].slice(2, 4)}
                  orientation={opening.color}
                />
              )}
          </div>
          <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-resting">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCursorIdx(0)}
                className="whitespace-nowrap text-[13px] font-semibold text-ink-soft transition hover:text-ink"
              >
                Début
              </button>
              <button
                onClick={() => setCursorIdx(c => Math.max(0, c - 1))}
                aria-label="Coup précédent"
                className="flex h-8 w-9 items-center justify-center rounded-lg border border-line-strong bg-field text-ink-soft transition hover:bg-track"
              >
                ←
              </button>
              <div className="relative flex-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-track">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${navPct}%` }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-field shadow-resting"
                  style={{ left: `${navPct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={navTotal}
                  value={cursorIdx}
                  onChange={e => setCursorIdx(Number(e.target.value))}
                  disabled={navTotal === 0}
                  aria-label="Naviguer dans la ligne"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
                />
              </div>
              <button
                onClick={() =>
                  setCursorIdx(c => (line ? Math.min(line.moves.length, c + 1) : c))
                }
                aria-label="Coup suivant"
                className="flex h-8 w-9 items-center justify-center rounded-lg border border-line-strong bg-field text-ink-soft transition hover:bg-track"
              >
                →
              </button>
              <button
                onClick={() => setCursorIdx(c => (line ? line.moves.length : c))}
                className="whitespace-nowrap text-[13px] font-semibold text-ink-soft transition hover:text-ink"
              >
                Fin
              </button>
              <span className="whitespace-nowrap pl-1 text-[12.5px] text-ink-muted tnum">
                {cursorIdx} / {navTotal}
              </span>
            </div>
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-resting">
          <div className="px-4 pt-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                Ligne en cours
              </span>
              <span className="text-[11px] text-ink-muted">(chip) = bascule</span>
            </div>
          </div>
          <div className="scoresheet-scroll max-h-75 overflow-y-auto px-4">
            {line && rootLine ? (
              <SelectedLineView
                line={line}
                sans={sansOfSelected}
                fenAtPosition={fenAtPosition}
                trie={trie}
                cursorIdx={cursorIdx}
                nagsAlongLine={nagsAlongLine}
                startFen={chapterStartFen}
                onSetCursor={pos => setCursorIdx(pos)}
                onSwitchLine={(lineId, pos) => {
                  setSelectedLineId(lineId);
                  setCursorIdx(pos);
                }}
              />
            ) : (
              <p className="pb-3 text-sm italic text-meta">
                Ouverture vide. Jouez un coup pour commencer.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-line bg-field px-4 py-3">
            <button
              onClick={truncateAtCursor}
              disabled={!line || cursorIdx >= line.moves.length}
              title="Supprime tous les coups après la position courante dans la ligne en cours"
              className="text-[13px] font-semibold text-warning-text transition hover:brightness-90 disabled:opacity-30"
            >
              Supprimer la suite
            </button>
            <button
              onClick={() => line && deleteLine(line.id)}
              disabled={!canDeleteVariant}
              title={
                canDeleteVariant
                  ? 'Supprime cette variante (ses enfants sont rattachés à son parent)'
                  : 'La ligne racine ne peut pas être supprimée'
              }
              className="text-[13px] font-semibold text-warning-text transition hover:brightness-90 disabled:opacity-30"
            >
              Supprimer la variante
            </button>
          </div>
        </div>

        <AnnotationPanel
          fen={currentFen}
          annotation={currentAnnotation}
          onPatch={patch => updateAnnotation(currentFen, patch)}
        />
      </aside>

      {chapterModal && (
        <ChapterNameModal
          forced={chapterModal.seedMoves.length > 0}
          defaultName={chapterModal.defaultName}
          onConfirm={confirmNewChapter}
          onCancel={() => setChapterModal(null)}
        />
      )}

      {exportOpen && (
        <ExportPgnModal onClose={() => setExportOpen(false)} opening={opening} />
      )}

      {rangeChapter && (
        <ReviewRangeModal
          opening={opening}
          chapter={rangeChapter}
          onSave={ranges => {
            saveReviewRanges(rangeChapter.id, ranges);
            setRangeChapterId(undefined);
          }}
          onClose={() => setRangeChapterId(undefined)}
        />
      )}
      </div>
    </main>
  );
}

function ChapterItem({
  chapter,
  active,
  canDelete,
  hasCustomRange,
  renaming,
  renameDraft,
  onSelect,
  onDefineReview,
  onRenameStart,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
}: {
  chapter: Chapter;
  active: boolean;
  canDelete: boolean;
  hasCustomRange: boolean;
  renaming: boolean;
  renameDraft: string;
  onSelect: () => void;
  onDefineReview: () => void;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative rounded-xl border transition ${
        active ? 'border-line bg-surface shadow-resting' : 'border-transparent hover:bg-track'
      }`}
    >
      {renaming ? (
        <input
          autoFocus
          value={renameDraft}
          onChange={e => onRenameChange(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={e => {
            if (e.key === 'Enter') onRenameSubmit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          className="w-full rounded-xl bg-transparent px-3.5 py-3 text-sm text-ink focus:outline-none"
        />
      ) : (
        <button
          onClick={onSelect}
          title={chapter.name}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition ${
            active ? 'text-ink' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <span
            className={`h-4.5 w-0.75 shrink-0 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`}
          />
          <span className="truncate">{chapter.name}</span>
          {hasCustomRange && (
            <span
              className="shrink-0 text-[13px] font-bold leading-none text-accent"
              title="Révision limitée à une fenêtre de coups"
            >
              ◎
            </span>
          )}
        </button>
      )}
      {!renaming && (
        <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-line bg-surface-high px-1 py-0.5 opacity-0 shadow-resting transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
          <button
            onClick={e => {
              e.stopPropagation();
              onDefineReview();
            }}
            title="Définir la révision (fenêtre de coups à driller)"
            className="rounded p-1 text-xs text-ink-soft transition hover:bg-track hover:text-ink"
          >
            ◎
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              onRenameStart();
            }}
            title="Renommer"
            className="rounded p-1 text-xs text-ink-soft transition hover:bg-track hover:text-ink"
          >
            ✎
          </button>
          {canDelete && (
            <button
              onClick={e => {
                e.stopPropagation();
                onDelete();
              }}
              title="Supprimer le chapitre"
              className="rounded p-1 text-xs text-ink-soft transition hover:bg-danger-soft hover:text-danger"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChapterNameModal({
  forced,
  defaultName,
  onConfirm,
  onCancel,
}: {
  forced: boolean;
  defaultName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  // Select the prefilled text on first focus so a single keypress overwrites
  // the suggestion when the user wants a different name.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.select();
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };
  return (
    <Modal open onClose={onCancel} title="Nouveau chapitre">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-meta">
          {forced
            ? 'Tu joues un coup différent sur ta couleur. Donne un nom au chapitre qui va porter cette variante — la révision saura ainsi quelle théorie tu veux driller.'
            : 'Crée un chapitre vide pour ranger une nouvelle ligne.'}
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex. Najdorf — Anglaise"
          autoFocus
          className="w-full rounded-md border border-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent-soft-border focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:text-ink"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="btn-accent rounded-btn px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Créer le chapitre
          </button>
        </div>
      </form>
    </Modal>
  );
}

type SegmentDraft = {
  /** Ply window [start, end) drafted for the segment; start === end means
   * nothing drilled in it. */
  start: number;
  end: number;
  /** True between the first and the second boundary click. */
  picking: boolean;
};

/**
 * Per-chapter review window editor, organized like the variation tree: the
 * trunk shared by every variant comes first, then one block per branch from
 * its fork on — no move is listed twice. Within a block, first click marks
 * the start of the window, second click the end (order-agnostic); `Aucun`
 * empties the block (e.g. a trunk known by heart). Windows are normalized on
 * save: full coverage → no ranges stored; a window reaching a line's current
 * last move stays open-ended so later additions join the drill.
 */
function ReviewRangeModal({
  opening,
  chapter,
  onSave,
  onClose,
}: {
  opening: Opening;
  chapter: Chapter;
  onSave: (ranges: Map<string, { start: number; end?: number }[] | undefined>) => void;
  onClose: () => void;
}) {
  const startFen = chapter.startFen ?? START_FEN;
  const lines = useMemo(
    () => opening.lines.filter(l => l.chapterId === chapter.id && l.moves.length > 0),
    [opening.lines, chapter.id],
  );
  const segments = useMemo(() => segmentLines(lines), [lines]);

  const meta = useMemo(() => {
    const c = chessFromFen(startFen);
    return {
      fullmove: c.fullmoves,
      startsBlack: turnColor(c) === 'black',
      userParity: turnColor(c) === opening.color ? 0 : 1,
    };
  }, [startFen, opening.color]);

  /** SAN per segment, resolved on a covering line long enough to reach its
   * tail (the first line of `lineIds` may end early). */
  const sansBySegment = useMemo(() => {
    const cache = new Map<string, string[]>();
    return segments.map(seg => {
      const rep = lines.find(
        l => seg.lineIds.includes(l.id) && l.moves.length >= seg.end,
      );
      if (!rep) return seg.moves;
      let sans = cache.get(rep.id);
      if (!sans) {
        sans = lineToSan(rep.moves, startFen);
        cache.set(rep.id, sans);
      }
      return sans.slice(seg.start, seg.end);
    });
  }, [segments, lines, startFen]);

  const [drafts, setDrafts] = useState<SegmentDraft[]>(() => {
    const lineById = new Map(lines.map(l => [l.id, l]));
    const covered = (lineIds: string[], ply: number): boolean => {
      for (const id of lineIds) {
        const l = lineById.get(id);
        if (!l || ply >= l.moves.length) continue;
        const rs = l.reviewRanges;
        if (!rs) return true;
        for (const r of rs) {
          if (ply >= r.start && (r.end === undefined || ply < r.end)) return true;
        }
      }
      return false;
    };
    return segments.map(seg => {
      let lo = -1;
      let hi = -1;
      for (let p = seg.start; p < seg.end; p++) {
        if (covered(seg.lineIds, p)) {
          if (lo < 0) lo = p;
          hi = p;
        }
      }
      // Holes inside one segment (possible after tree edits moved a fork)
      // collapse to the enclosing window — the user re-narrows if needed.
      return lo < 0
        ? { start: seg.start, end: seg.start, picking: false }
        : { start: lo, end: hi + 1, picking: false };
    });
  });

  const clickPly = (segIdx: number, ply: number) => {
    setDrafts(prev =>
      prev.map((d, i) => {
        if (i !== segIdx) return d;
        if (!d.picking) return { start: ply, end: ply + 1, picking: true };
        if (ply >= d.start) return { start: d.start, end: ply + 1, picking: false };
        return { start: ply, end: d.end, picking: false };
      }),
    );
  };

  const setWholeSegment = (segIdx: number) =>
    setDrafts(prev =>
      prev.map((d, i) =>
        i === segIdx
          ? { start: segments[i].start, end: segments[i].end, picking: false }
          : d,
      ),
    );

  const setEmptySegment = (segIdx: number) =>
    setDrafts(prev =>
      prev.map((d, i) =>
        i === segIdx
          ? { start: segments[i].start, end: segments[i].start, picking: false }
          : d,
      ),
    );

  /** `3.` / `3…` label for the ply, honouring a custom starting position. */
  const plyLabel = (ply: number): string => {
    const slot = ply + (meta.startsBlack ? 1 : 0);
    const num = meta.fullmove + Math.floor(slot / 2);
    return slot % 2 === 0 ? `${num}.` : `${num}…`;
  };

  const isWhitePly = (ply: number): boolean =>
    (ply + (meta.startsBlack ? 1 : 0)) % 2 === 0;

  const userMovesIn = (d: SegmentDraft): number => {
    let n = 0;
    for (let i = d.start; i < d.end; i++) {
      if (i % 2 === meta.userParity) n++;
    }
    return n;
  };

  const totalDrilled = drafts.reduce((s, d) => s + userMovesIn(d), 0);
  const topLevelCount = segments.filter(s => s.start === 0).length;

  const segLabel = (segIdx: number): string => {
    const seg = segments[segIdx];
    if (seg.start === 0 && topLevelCount === 1) {
      return segments.length === 1 ? 'Ligne principale' : 'Tronc commun';
    }
    return `${plyLabel(seg.start)} ${sansBySegment[segIdx][0] ?? ''}`;
  };

  const submit = () => {
    // Each segment window applies to every line passing through it; a line's
    // stored ranges are the merge of its segments' windows, clamped to its
    // own length (early-ending lines).
    const intervalsByLine = new Map<string, { start: number; end: number }[]>(
      lines.map(l => [l.id, []]),
    );
    segments.forEach((seg, i) => {
      const d = drafts[i];
      if (!d || d.end <= d.start) return;
      for (const id of seg.lineIds) {
        intervalsByLine.get(id)?.push({ start: d.start, end: d.end });
      }
    });
    const ranges = new Map<string, { start: number; end?: number }[] | undefined>();
    for (const l of lines) {
      const len = l.moves.length;
      const clamped = (intervalsByLine.get(l.id) ?? [])
        .map(v => ({ start: v.start, end: Math.min(v.end, len) }))
        .filter(v => v.end > v.start)
        .sort((a, b) => a.start - b.start);
      const merged: { start: number; end: number }[] = [];
      for (const v of clamped) {
        const last = merged[merged.length - 1];
        if (last && v.start <= last.end) last.end = Math.max(last.end, v.end);
        else merged.push({ ...v });
      }
      if (merged.length === 1 && merged[0].start === 0 && merged[0].end >= len) {
        ranges.set(l.id, undefined);
      } else {
        // The tail interval reaching the line's current end stays open-ended.
        ranges.set(
          l.id,
          merged.map(v => (v.end >= len ? { start: v.start } : v)),
        );
      }
    }
    onSave(ranges);
  };

  return (
    <Modal open wide onClose={onClose} title={`Définir la révision — ${chapter.name}`}>
      <div className="space-y-4">
        <p className="text-xs text-meta">
          Le tronc commun regroupe les coups partagés par toutes les variantes ;
          chaque branche se règle à partir de sa bifurcation. Clique le premier
          puis le dernier coup à réviser dans chaque bloc. Hors fenêtre, rien
          n'est dû ni compté dans la maîtrise — le progrès des cartes est
          conservé si tu réélargis.
        </p>

        {segments.length === 0 ? (
          <p className="text-sm italic text-meta">
            Ce chapitre ne contient encore aucun coup.
          </p>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {segments.map((seg, segIdx) => {
              const d = drafts[segIdx];
              if (!d) return null;
              const sans = sansBySegment[segIdx];
              const drilled = userMovesIn(d);
              const whole = d.start === seg.start && d.end === seg.end;
              const empty = d.end <= d.start;
              return (
                <div
                  key={`${seg.start}-${seg.moves[0]}-${segIdx}`}
                  className="rounded-[10px] border border-line bg-surface p-3"
                  style={{ marginLeft: seg.depth * 16 }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
                      {seg.depth > 0 && (
                        <span className="text-ink-muted">↳</span>
                      )}
                      <span className="truncate">{segLabel(segIdx)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className="text-[11.5px] text-meta tnum">
                        {drilled > 0
                          ? `${drilled} coup${drilled > 1 ? 's' : ''} à driller`
                          : 'rien à driller'}
                      </span>
                      <button
                        onClick={() => setWholeSegment(segIdx)}
                        disabled={whole}
                        className="text-[11.5px] font-semibold text-ink-muted transition hover:text-ink disabled:opacity-40"
                      >
                        Tout
                      </button>
                      <button
                        onClick={() => setEmptySegment(segIdx)}
                        disabled={empty}
                        className="text-[11.5px] font-semibold text-ink-muted transition hover:text-ink disabled:opacity-40"
                      >
                        Aucun
                      </button>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-y-1.5">
                    {seg.moves.map((uci, j) => {
                      const ply = seg.start + j;
                      const inRange = ply >= d.start && ply < d.end;
                      return (
                        <Fragment key={ply}>
                          {(isWhitePly(ply) || j === 0) && (
                            <span className="select-none pl-1.5 pr-1 text-[11.5px] text-ink-muted tnum">
                              {plyLabel(ply)}
                            </span>
                          )}
                          <button
                            onClick={() => clickPly(segIdx, ply)}
                            className={`rounded-md border px-1.5 py-0.5 text-[13.5px] transition ${
                              inRange
                                ? 'border-accent-soft-border bg-accent-soft font-semibold text-accent-soft-text'
                                : 'border-transparent text-ink-muted hover:bg-track hover:text-ink'
                            }`}
                          >
                            <FigurineSan san={sans[j] ?? uci} />
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span
            className={`text-[12.5px] tnum ${
              totalDrilled > 0 ? 'text-meta' : 'font-semibold text-warning-text'
            }`}
          >
            {totalDrilled} coup{totalDrilled > 1 ? 's' : ''} à driller dans ce
            chapitre
          </span>
          <span className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:text-ink"
            >
              Annuler
            </button>
            <button
              onClick={submit}
              className="btn-accent rounded-btn px-4 py-2 text-sm font-semibold"
            >
              Enregistrer
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Vertical white-vs-black bar à la chess.com / lichess. White fills from the
 * bottom; the boundary moves smoothly as the engine eval changes. Keeps the
 * last known share when navigating to a position the engine hasn't analyzed
 * yet, so the bar slides directly from old → new instead of snapping through
 * neutral.
 */
function EvalBar({
  result,
  currentFen,
  chess,
}: {
  result: EngineResult | null;
  currentFen: string;
  chess: Chess;
}) {
  const [whiteShare, setWhiteShare] = useState(0.5);

  useEffect(() => {
    if (!result || result.fen !== currentFen) return;
    const best = result.lines[0];
    if (!best) return;
    const sign = turnColor(chess) === 'white' ? 1 : -1;
    let next: number;
    if (best.mate !== undefined) {
      const m = best.mate * sign;
      next = m > 0 ? 0.97 : 0.03;
    } else {
      const cp = (best.cp ?? 0) * sign;
      // tanh squashes wide eval ranges into a comfortable visual band:
      // cp=200 → ~0.66, cp=600 → ~0.76, cp=1200 → ~0.97.
      next = 0.5 + Math.tanh(cp / 600) * 0.5;
      next = Math.max(0.02, Math.min(0.98, next));
    }
    setWhiteShare(next);
  }, [result, currentFen, chess]);

  return (
    <div className="absolute -left-5 top-0 h-full w-2.5 overflow-hidden rounded-sm bg-ink ring-1 ring-line-strong">
      <div
        className="absolute inset-x-0 bottom-0 bg-surface-high transition-[height] duration-500 ease-out"
        style={{ height: `${whiteShare * 100}%` }}
      />
    </div>
  );
}

/**
 * YouTube search shortcut shown next to the opening chip. When an opening is
 * recognized, opens a new tab with a curated search query; otherwise renders
 * a greyed-out placeholder of the same width so the chip row stays
 * layout-stable.
 */
function YoutubeSearchButton({
  opening,
  color,
}: {
  opening: RecognizedOpening | null;
  color: Color;
}) {
  const baseClass =
    'inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface-high px-3 py-1 text-[13px] font-semibold transition';
  const icon = (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.376.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.546 15.568V8.432L15.818 12z" />
    </svg>
  );
  if (!opening) {
    return (
      <span
        className={`${baseClass} cursor-not-allowed text-ink-muted`}
        aria-disabled="true"
        title="Pas d'ouverture reconnue"
      >
        {icon} YouTube
      </span>
    );
  }
  const query = `${opening.name} chess opening ${color}`;
  const href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${baseClass} text-danger hover:bg-field`}
      title={`Rechercher "${query}" sur YouTube`}
    >
      {icon} YouTube
    </a>
  );
}

function EngineToggle({
  enabled,
  isThinking,
  evalText,
  onToggle,
}: {
  enabled: boolean;
  isThinking: boolean;
  evalText: string | null;
  onToggle: () => void;
}) {
  const score = evalText ?? '';
  const positive = score.startsWith('+') || score.startsWith('M');
  return (
    <button
      onClick={onToggle}
      title={
        enabled
          ? 'Stockfish actif — clic pour désactiver'
          : 'Activer Stockfish (analyse + flèches de coups suggérés)'
      }
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-semibold transition hover:brightness-[0.97] ${
        enabled
          ? 'border-info-border bg-info-soft text-info'
          : 'border-line-strong bg-surface text-ink-muted hover:bg-surface-high'
      }`}
    >
      <span>Engine</span>
      <span
        className={`h-1.75 w-1.75 rounded-full transition ${
          enabled
            ? isThinking
              ? 'animate-pulse bg-success ring-[3px] ring-success/20'
              : 'bg-success ring-[3px] ring-success/20'
            : 'bg-line-strong'
        }`}
      />
      {enabled && evalText !== null && (
        <span
          className={`text-[13px] tnum ${positive ? 'text-success' : 'text-danger'}`}
        >
          {evalText}
        </span>
      )}
    </button>
  );
}

function ExportPgnModal({
  onClose,
  opening,
}: {
  onClose: () => void;
  opening: Opening;
}) {
  const pgn = useMemo(() => exportToPgn(opening), [opening]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignored */
    }
  };

  return (
    <Modal open onClose={onClose} title="Exporter en PGN">
      <div className="space-y-3">
        <p className="text-xs text-meta">
          Compatible Lichess Study, ChessBase, Chessable. Un chapitre = une
          partie PGN. Inclut variantes, commentaires, NAGs et flèches.
        </p>
        <textarea
          readOnly
          value={pgn}
          rows={10}
          className="w-full resize-none rounded-md border border-line bg-field p-2 font-mono text-xs text-ink focus:outline-none"
          onFocus={e => e.currentTarget.select()}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:text-ink"
          >
            Fermer
          </button>
          <button
            onClick={copy}
            className="btn-accent rounded-btn px-4 py-2 text-sm font-semibold"
          >
            {copied ? 'Copié ✓' : 'Copier'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type TrieRoot = ReturnType<typeof buildPrefixTrie>;

type SelectedLineProps = {
  line: Line;
  sans: string[];
  fenAtPosition: Map<number, string>;
  trie: TrieRoot;
  cursorIdx: number;
  nagsAlongLine: Map<number, Nag>;
  /** Starting FEN for the chapter the selected line belongs to. Drives the
   * move numbers and the white/black column assignment when a chapter
   * starts past the initial position. */
  startFen: string;
  onSetCursor: (pos: number) => void;
  onSwitchLine: (lineId: string, pos: number) => void;
};

/**
 * Renders the selected line as a scoresheet-style table: one row per move
 * pair (number · white cell · black cell). Each cell holds the played move
 * and any sibling continuations seen at that ply as italic paren-chips.
 * Clicking a chip switches the selected line to one that takes that
 * continuation, landing the cursor on the alternative move.
 */
function SelectedLineView({
  line,
  sans,
  fenAtPosition,
  trie,
  cursorIdx,
  nagsAlongLine,
  startFen,
  onSetCursor,
  onSwitchLine,
}: SelectedLineProps) {
  // Read the starting fullmove number and side-to-move from the chapter's
  // starting FEN. A chapter that begins after `3.d4` (black to move at
  // fullmove 3) needs to label its first move "3..." and reserve an empty
  // white cell on the first row.
  const startMeta = useMemo(() => {
    const c = chessFromFen(startFen);
    return {
      fullmove: c.fullmoves,
      startsBlack: turnColor(c) === 'black',
    };
  }, [startFen]);

  if (line.moves.length === 0) {
    return (
      <div className="py-3 text-sm">
        <button
          onClick={() => onSetCursor(0)}
          className={`rounded-md px-2 py-1 text-xs italic transition ${
            cursorIdx === 0
              ? 'border border-line-strong bg-surface-high text-ink shadow-resting'
              : 'text-meta hover:bg-track'
          }`}
        >
          (position initiale — jouez un coup)
        </button>
      </div>
    );
  }

  const offset = startMeta.startsBlack ? 1 : 0;
  const tailPos = line.moves.length;
  const trailing = continuationsAt(trie, line, tailPos);
  const totalRows = Math.ceil((line.moves.length + offset) / 2);
  // The next move would be white when the count of slots so far (offset +
  // plies) is even — that's when we need a fresh row to host a trailing
  // white chip from an alternative continuation.
  const nextSideIsWhite = (line.moves.length + offset) % 2 === 0;
  const needsTrailingRow = trailing.length > 0 && nextSideIsWhite;
  const rowsToRender = totalRows + (needsTrailingRow ? 1 : 0);

  const rows: React.ReactNode[] = [];
  for (let rowIdx = 0; rowIdx < rowsToRender; rowIdx++) {
    const fullmove = startMeta.fullmove + rowIdx;
    // `whitePly` is `-1` for the first row when the chapter starts on
    // black's move — we render an empty placeholder cell so the column
    // grid stays aligned with the number column.
    const whitePly = rowIdx * 2 - offset;
    const blackPly = whitePly + 1;
    const isEven = rowIdx % 2 === 0;

    rows.push(
      <Fragment key={rowIdx}>
        <div
          className={`select-none px-3 py-1.5 text-right text-ink-muted tnum ${
            isEven ? 'bg-field' : ''
          }`}
        >
          {fullmove}.
        </div>
        {whitePly >= 0 ? (
          <MoveCell
            line={line}
            sans={sans}
            pos={whitePly}
            tailPos={tailPos}
            trie={trie}
            trailing={trailing}
            fenAtPosition={fenAtPosition}
            cursorIdx={cursorIdx}
            nag={nagsAlongLine.get(whitePly)}
            onSetCursor={onSetCursor}
            onSwitchLine={onSwitchLine}
            shaded={isEven}
          />
        ) : (
          <div
            className={`border-l border-line px-3 py-1.5 ${
              isEven ? 'bg-field' : ''
            }`}
          />
        )}
        <MoveCell
          line={line}
          sans={sans}
          pos={blackPly}
          tailPos={tailPos}
          trie={trie}
          trailing={trailing}
          fenAtPosition={fenAtPosition}
          cursorIdx={cursorIdx}
          nag={nagsAlongLine.get(blackPly)}
          onSetCursor={onSetCursor}
          onSwitchLine={onSwitchLine}
          shaded={isEven}
        />
      </Fragment>,
    );
  }

  return (
    <div className="grid grid-cols-[34px_1fr_1fr] overflow-hidden pb-2 text-sm">
      {rows}
    </div>
  );
}

type MoveCellProps = {
  line: Line;
  sans: string[];
  pos: number;
  tailPos: number;
  trie: TrieRoot;
  trailing: { uci: string; lineIds: string[] }[];
  fenAtPosition: Map<number, string>;
  cursorIdx: number;
  nag: Nag | undefined;
  onSetCursor: (pos: number) => void;
  onSwitchLine: (lineId: string, pos: number) => void;
  shaded: boolean;
};

function MoveCell({
  line,
  sans,
  pos,
  tailPos,
  trie,
  trailing,
  fenAtPosition,
  cursorIdx,
  nag,
  onSetCursor,
  onSwitchLine,
  shaded,
}: MoveCellProps) {
  const hasMove = pos < line.moves.length;
  const isTail = pos === tailPos;
  const fen = fenAtPosition.get(pos);
  const alts =
    hasMove && fen
      ? continuationsAt(trie, line, pos).filter(c => c.uci !== line.moves[pos])
      : isTail
        ? trailing
        : [];

  return (
    <div
      className={`border-l border-line px-3 py-1.5 ${shaded ? 'bg-field' : ''}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        {hasMove && (
          <span className="inline-flex items-baseline gap-0.5">
            <SelectedMove
              san={sans[pos] ?? line.moves[pos]}
              isCursor={cursorIdx === pos + 1}
              onClick={() => onSetCursor(pos + 1)}
            />
            {nag !== undefined && (
              <span
                className={`text-xs font-bold leading-none ${NAG_COLORS[nag]}`}
                title={NAG_LABELS[nag]}
              >
                {NAG_SYMBOLS[nag]}
              </span>
            )}
          </span>
        )}
        {fen &&
          alts.map(alt => (
            <AltChip
              key={alt.uci}
              san={uciToSanAt(fen, alt.uci)}
              onClick={() => onSwitchLine(alt.lineIds[0], pos + 1)}
            />
          ))}
      </div>
    </div>
  );
}

function SelectedMove({
  san,
  isCursor,
  onClick,
}: {
  san: string;
  isCursor: boolean;
  onClick: () => void;
}) {
  // The white/black distinction is now carried by the column the cell sits
  // in, so the move itself can stay uniform — only the cursor needs to pop.
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-1.5 py-0.5 font-semibold transition ${
        isCursor
          ? 'border border-line-strong bg-surface-high text-ink shadow-resting'
          : 'text-ink hover:bg-track'
      }`}
    >
      <FigurineSan san={san} />
    </button>
  );
}

function AnnotationPanel({
  fen,
  annotation,
  onPatch,
}: {
  fen: string;
  annotation: Annotation | undefined;
  onPatch: (patch: Partial<Annotation>) => void;
}) {
  // Only the comment is held locally for smooth typing; NAG and arrows are
  // mirrored straight from `annotation` so other writers (chessground onChange,
  // another panel) can't be silently overwritten on save.
  const [draftComment, setDraftComment] = useState(annotation?.comment ?? '');
  const draftCommentRef = useRef(draftComment);
  draftCommentRef.current = draftComment;

  useEffect(() => {
    setDraftComment(annotation?.comment ?? '');
  }, [fen]);

  const toggleNag = (nag: Nag) => {
    onPatch({ nag: annotation?.nag === nag ? undefined : nag });
  };

  const clearArrows = () => onPatch({ arrows: [] });

  const onCommentBlur = () => onPatch({ comment: draftCommentRef.current });

  const arrowsCount = annotation?.arrows?.length ?? 0;
  const currentNag = annotation?.nag;

  return (
    <div className="rounded-[14px] border border-line bg-surface p-4 shadow-resting">
      <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        Annotation
      </div>
      <div className="mb-2 text-xs font-semibold text-ink-soft">Qualité du coup</div>
      <div className="mb-4 flex gap-1.75">
        {NAG_ORDER.map(n => (
          <button
            key={n}
            onClick={() => toggleNag(n)}
            title={NAG_LABELS[n]}
            className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-[15px] font-bold transition ${NAG_COLORS[n]} ${
              currentNag === n
                ? 'border-current bg-current/10 ring-2 ring-current/20'
                : 'border-line bg-field hover:border-current/40 hover:bg-current/5'
            }`}
          >
            {NAG_SYMBOLS[n]}
          </button>
        ))}
      </div>
      <div className="mb-2 text-xs font-semibold text-ink-soft">Commentaire</div>
      <textarea
        value={draftComment}
        onChange={e => setDraftComment(e.target.value)}
        onBlur={onCommentBlur}
        placeholder="Idée du coup, plan, faiblesse à exploiter…"
        rows={3}
        className="w-full resize-y rounded-[10px] border border-line-strong bg-field p-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
      />
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[12.5px] text-ink-muted">
        <span>
          {arrowsCount > 0
            ? `${arrowsCount} forme${arrowsCount > 1 ? 's' : ''} sur le plateau`
            : 'Clic-droit-glisser pour dessiner des flèches'}
        </span>
        {arrowsCount > 0 && (
          <button
            onClick={clearArrows}
            className="font-semibold text-warning-text transition hover:brightness-90"
          >
            Effacer les flèches
          </button>
        )}
      </div>
    </div>
  );
}

function AltChip({
  san,
  onClick,
}: {
  san: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`Basculer sur la variante ${san}`}
      className="cursor-pointer italic text-ink-muted transition hover:text-ink"
    >
      (<FigurineSan san={san} />)
    </button>
  );
}
