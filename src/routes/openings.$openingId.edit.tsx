import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chess } from 'chessops/chess';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
import { NagSquareBadge } from '../components/NagSquareBadge';
import { BoardNav } from '../components/opening/BoardNav';
import { ChapterNameModal } from '../components/opening/ChapterNameModal';
import { ExplorerPanel } from '../components/opening/ExplorerPanel';
import { OpeningNotFound } from '../components/opening/OpeningNotFound';
import { RecognitionBar } from '../components/opening/RecognitionBar';
import { SelectedLineView } from '../components/opening/SelectedLineView';
import { useLineNavigation } from '../components/opening/useLineNavigation';
import { PromotionChooser } from '../components/PromotionChooser';
import {
  fenOf,
  isPromotion,
  legalDests,
  positionKey,
  sameMove,
  turnColor,
  uciFromMove,
  uciToSanAt,
  type PromotionRole,
} from '../domain/chess';
import { engine, type EngineResult } from '../domain/engine';
import { useCommon } from '../i18n/common';
import { useEditorStrings } from '../i18n/editor';
import { NAG_COLORS, NAG_ORDER, NAG_SYMBOLS } from '../domain/nag';
import { recognizeOpening } from '../domain/openings-db';
import { parentForNewVariant } from '../domain/tree';
import type {
  Annotation,
  ArrowBrush,
  ArrowDef,
  Chapter,
  Line,
  Nag,
  Opening,
} from '../domain/types';
import { openingsRepo } from '../storage/repository';
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

type EditSearch = { line?: string; ply?: number };

export const Route = createFileRoute('/openings/$openingId/edit')({
  component: EditOpening,
  // Optional deep link (e.g. from the Lichess deviations tab or the
  // overview's "Éditer" CTA): land on a given line with the cursor at a
  // given ply.
  validateSearch: (search: Record<string, unknown>): EditSearch => ({
    line: typeof search.line === 'string' ? search.line : undefined,
    ply: typeof search.ply === 'number' ? search.ply : undefined,
  }),
});

function EditOpening() {
  const { openingId } = Route.useParams();
  const { line, ply } = Route.useSearch();
  const opening = useStored(() => openingsRepo.get(openingId));
  if (!opening) return <OpeningNotFound />;
  return (
    <EditOpeningInner
      key={opening.id}
      opening={opening}
      initialLineId={line}
      initialPly={ply}
    />
  );
}

function EditOpeningInner({
  opening,
  initialLineId,
  initialPly,
}: {
  opening: Opening;
  initialLineId?: string;
  initialPly?: number;
}) {
  const tr = useEditorStrings();
  const c = useCommon();
  // The editor works on an in-memory draft: nothing touches storage until
  // "Enregistrer". The ref is updated synchronously by every mutation, so
  // two handlers firing on the same tick (arrow drawn → move played) never
  // read a stale draft — the guarantee the fresh-repo re-read used to give.
  const [draft, setDraftState] = useState<Opening>(opening);
  const draftRef = useRef(opening);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const setDraft = (next: Opening) => {
    draftRef.current = next;
    setDraftState(next);
    dirtyRef.current = true;
    setDirty(true);
  };

  const save = () => {
    openingsRepo.save({ ...draftRef.current, updatedAt: Date.now() });
    dirtyRef.current = false;
    setDirty(false);
  };

  // Block in-app navigation (and tab close via beforeunload) while unsaved.
  useBlocker({
    shouldBlockFn: () => dirtyRef.current && !confirm(tr.unsavedConfirm),
    enableBeforeUnload: () => dirtyRef.current,
  });

  const {
    line,
    selectedLineId,
    cursorIdx,
    setCursorIdx,
    selectLine,
    switchToChapter,
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
  } = useLineNavigation(draft, { lineId: initialLineId, ply: initialPly });

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
  /** Pawn dropped on the last rank: the move waits for the piece choice. */
  const [pendingPromo, setPendingPromo] = useState<{ orig: Key; dest: Key } | null>(
    null,
  );

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

  /**
   * Apply a mutation against the **freshest** draft (the synchronously
   * updated ref) rather than a closure copy. Without this, two writes
   * triggered in quick succession (e.g. arrow drawn → move played) race on
   * the closure-captured draft and the later one silently drops the earlier
   * change.
   */
  const updateOpening = (mutator: (latest: Opening) => Opening) => {
    setDraft(mutator(draftRef.current));
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
   * open: `seedMoves` is what the new chapter's root line will hold (the
   * full move sequence up to a forced fork); `defaultName` is what we
   * prefill into the name input. */
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
    // Resolve everything against the freshest draft to avoid clobbering a
    // sibling mutation (e.g. arrows just recorded by drawable.onChange).
    const latest = draftRef.current;
    const latestLine = latest.lines.find(l => l.id === line.id);
    if (!latestLine) return;

    if (cursorIdx === latestLine.moves.length) {
      setDraft({
        ...latest,
        lines: latest.lines.map(l =>
          l.id === latestLine.id ? { ...l, moves: [...l.moves, uci] } : l,
        ),
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
      selectLine(existing.id, cursorIdx + 1);
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
    if (turnColor(chess) === draft.color) {
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
      // reading the recognition state: this handler lives in the chessground
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
      name: tr.variantName,
      chapterId: latestLine.chapterId,
      parentLineId: parent.id,
      moves: [...prefix, uci],
    };
    setDraft({
      ...latest,
      lines: [...latest.lines, variant],
    });
    selectLine(variant.id, prefix.length + 1);
  };

  /** Commit the pending "new chapter" prompt: append a fresh Chapter + a root
   * Line seeded with whatever moves the modal carried, then jump the cursor
   * into the new chapter. */
  const confirmNewChapter = (name: string) => {
    if (!chapterModal) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const latest = draftRef.current;
    // A FORCED fork on a custom-start chapter (e.g. user diverges inside a
    // Scotch line that already begins after `3.d4`) inherits the starting
    // FEN — the seedMoves are sequenced from there and need to replay
    // correctly.
    const inheritedStartFen =
      chapterModal.seedMoves.length > 0 ? currentChapter?.startFen : undefined;
    const chapter: Chapter = {
      id: crypto.randomUUID(),
      name: trimmed,
      order: latest.chapters.length,
      ...(inheritedStartFen ? { startFen: inheritedStartFen } : {}),
    };
    const newRoot: Line = {
      id: crypto.randomUUID(),
      name: tr.mainLineName,
      chapterId: chapter.id,
      parentLineId: undefined,
      moves: [...chapterModal.seedMoves],
    };
    setDraft({
      ...latest,
      chapters: [...latest.chapters, chapter],
      lines: [...latest.lines, newRoot],
    });
    selectLine(newRoot.id, newRoot.moves.length);
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
      orientation: draft.color,
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
            if (isPromotion(chess, orig, dest)) {
              // Don't play yet: the chooser resolves (or cancels) the move.
              setPendingPromo({ orig, dest });
              return;
            }
            playMove(uciFromMove(chess, orig, dest));
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
    // pendingPromo is a dep so opening/cancelling the chooser re-sets the fen
    // (snaps the visually-moved pawn back until the choice is made).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, draft, line, cursorIdx, selectedLineId, currentAnnotation, currentFen, engineAutoShapes, pendingPromo]);

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

  const canDeleteVariant = !!line && line.id !== rootLine?.id;

  return (
    <main className="mx-auto max-w-325 px-10 pb-17.5 pt-4">
      <div className="mb-4 grid grid-cols-[240px_1fr_350px] items-center gap-8">
        <Link
          to="/openings/$openingId"
          params={{ openingId: opening.id }}
          className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-on-muted transition hover:text-on-ink"
        >
          {c.back}
        </Link>
        <div className="flex min-w-0 items-center gap-5">
          <h1 className="min-w-0 truncate text-[28px] font-extrabold tracking-[-0.02em] text-on-ink">
            {draft.name}
          </h1>
          {sortedChapters.length > 0 && (
            <select
              value={currentChapter?.id ?? ''}
              onChange={e => switchToChapter(e.target.value)}
              title={tr.switchChapter}
              className="h-9 max-w-60 shrink-0 truncate rounded-[10px] border border-line-strong bg-field px-2.5 text-[13px] font-semibold text-ink focus:border-accent-soft-border focus:outline-none"
            >
              {sortedChapters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center justify-end gap-3">
          {dirty && (
            <span className="whitespace-nowrap rounded-full border border-warning-border bg-warning-soft px-2.5 py-1 text-[12px] font-semibold text-warning-text">
              {tr.unsaved}
            </span>
          )}
          <button
            onClick={save}
            disabled={!dirty}
            className={
              dirty
                ? 'btn-accent flex h-10 items-center rounded-[10px] px-5 text-[13.5px] font-semibold'
                : 'flex h-10 cursor-default items-center rounded-[10px] border border-ground-line bg-ground-overlay px-5 text-[13.5px] font-semibold text-on-muted'
            }
          >
            {dirty ? tr.save : tr.saved}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[240px_1fr_350px] items-start gap-8">
      <aside className="flex flex-col gap-4">
        <ExplorerPanel fen={currentFen} onPlayMove={playMove} />
      </aside>
      {/* Constrained to the board width and end-aligned: the column's spare
          space lands between the explorer and the board, the move panels sit
          close, and the ECO/YouTube bar lines up with the board edges. */}
      <section className="w-132 max-w-full justify-self-end space-y-4">
        <EngineToggle
          enabled={engineEnabled}
          isThinking={isThinking}
          evalText={evalText}
          onToggle={toggleEngine}
        />
        <RecognitionBar
          moves={line?.moves}
          cursorIdx={cursorIdx}
          startFen={chapterStartFen}
          color={draft.color}
        />
        <div className="space-y-3">
          <div className="relative">
            {engineEnabled && (
              <EvalBar
                result={engineResult}
                currentFen={currentFen}
                chess={chess}
              />
            )}
            <Chessboard config={config} />
            {pendingPromo && (
              <PromotionChooser
                dest={pendingPromo.dest}
                color={turnColor(chess)}
                orientation={draft.color}
                onPick={(role: PromotionRole) => {
                  playMove(uciFromMove(chess, pendingPromo.orig, pendingPromo.dest, role));
                  setPendingPromo(null);
                }}
                onCancel={() => setPendingPromo(null)}
              />
            )}
            {currentAnnotation?.nag !== undefined &&
              cursorIdx > 0 &&
              line &&
              line.moves[cursorIdx - 1] && (
                <NagSquareBadge
                  nag={currentAnnotation.nag}
                  square={line.moves[cursorIdx - 1].slice(2, 4)}
                  orientation={draft.color}
                />
              )}
          </div>
          <BoardNav
            cursorIdx={cursorIdx}
            total={line?.moves.length ?? 0}
            onChange={setCursorIdx}
          />
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface text-ink shadow-resting">
          <div className="px-4 pt-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                {tr.currentLine}
              </span>
              <span className="text-[11px] text-ink-muted">{tr.chipHint}</span>
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
                onSwitchLine={selectLine}
              />
            ) : (
              <p className="pb-3 text-sm italic text-meta">{tr.emptyOpening}</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-line bg-field px-4 py-3">
            <button
              onClick={truncateAtCursor}
              disabled={!line || cursorIdx >= line.moves.length}
              title={tr.deleteRestTitle}
              className="text-[13px] font-semibold text-warning-text transition hover:brightness-90 disabled:opacity-30"
            >
              {tr.deleteRest}
            </button>
            <button
              onClick={() => line && deleteLine(line.id)}
              disabled={!canDeleteVariant}
              title={canDeleteVariant ? tr.deleteVariantTitle : tr.rootUndeletable}
              className="text-[13px] font-semibold text-warning-text transition hover:brightness-90 disabled:opacity-30"
            >
              {tr.deleteVariant}
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
          forced
          defaultName={chapterModal.defaultName}
          onConfirm={confirmNewChapter}
          onCancel={() => setChapterModal(null)}
        />
      )}
      </div>
    </main>
  );
}

/**
 * Vertical white-vs-black bar in the style of chess.com / lichess. White fills from the
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
    <div className="absolute -left-5 top-0 h-full w-2.5 overflow-hidden rounded-sm bg-black ring-1 ring-ground-line">
      <div
        className="absolute inset-x-0 bottom-0 bg-white transition-[height] duration-500 ease-out"
        style={{ height: `${whiteShare * 100}%` }}
      />
    </div>
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
  const tr = useEditorStrings();
  const score = evalText ?? '';
  const positive = score.startsWith('+') || score.startsWith('M');
  return (
    <button
      onClick={onToggle}
      title={enabled ? tr.engineOnTitle : tr.engineOffTitle}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-semibold transition hover:brightness-[0.97] ${
        enabled
          ? 'border-info-border bg-info-soft text-info-text'
          : 'border-ground-line bg-ground-overlay text-seg-off'
      }`}
    >
      <span>{tr.engineLabel}</span>
      <span
        className={`h-1.75 w-1.75 rounded-full transition ${
          enabled
            ? isThinking
              ? 'animate-pulse bg-success ring-[3px] ring-success/20'
              : 'bg-success ring-[3px] ring-success/20'
            : 'bg-on-idle'
        }`}
      />
      {enabled && evalText !== null && (
        <span
          className={`text-[13px] tnum ${positive ? 'text-success-text' : 'text-danger-text'}`}
        >
          {evalText}
        </span>
      )}
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
  const tr = useEditorStrings();
  const { nagLabels } = useCommon();
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
        {tr.annotation}
      </div>
      <div className="mb-2 text-xs font-semibold text-ink-soft">{tr.moveQuality}</div>
      <div className="mb-4 flex gap-1.75">
        {NAG_ORDER.map(n => (
          <button
            key={n}
            onClick={() => toggleNag(n)}
            title={nagLabels[n]}
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
      <div className="mb-2 text-xs font-semibold text-ink-soft">{tr.comment}</div>
      <textarea
        value={draftComment}
        onChange={e => setDraftComment(e.target.value)}
        onBlur={onCommentBlur}
        placeholder={tr.commentPlaceholder}
        rows={3}
        className="w-full resize-y rounded-[10px] border border-line-strong bg-field p-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
      />
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[12.5px] text-ink-muted">
        <span>{arrowsCount > 0 ? tr.shapesOnBoard(arrowsCount) : tr.drawArrowsHint}</span>
        {arrowsCount > 0 && (
          <button
            onClick={clearArrows}
            className="font-semibold text-warning-text transition hover:brightness-90"
          >
            {tr.clearArrows}
          </button>
        )}
      </div>
    </div>
  );
}
