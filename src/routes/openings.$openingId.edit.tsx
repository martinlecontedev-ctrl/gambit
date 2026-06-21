import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Chess } from 'chessops/chess';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
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
} from '../domain/tree';
import type {
  Annotation,
  ArrowBrush,
  ArrowDef,
  Color,
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

export const Route = createFileRoute('/openings/$openingId/edit')({ component: EditOpening });

function EditOpening() {
  const { openingId } = Route.useParams();
  const opening = useStored(() => openingsRepo.get(openingId));
  if (!opening) return <NotFound />;
  return <EditOpeningInner key={opening.id} opening={opening} />;
}

function NotFound() {
  return (
    <div className="text-center text-zinc-400">
      Ouverture introuvable.{' '}
      <Link to="/" className="text-zinc-100 underline">
        Retour
      </Link>
    </div>
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

  const chess = useMemo(() => {
    let c = chessFromFen(START_FEN);
    const upTo = line?.moves.slice(0, cursorIdx) ?? [];
    for (const m of upTo) c = applyUci(c, m);
    return c;
  }, [line, cursorIdx]);

  const trie = useMemo(() => buildPrefixTrie(opening.lines), [opening.lines]);

  const rootLine = useMemo(
    () => opening.lines.find(l => !effectiveParentId(opening.lines, l)),
    [opening.lines],
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

  /** SAN sequence of the selected line. */
  const sansOfSelected = useMemo(
    () => (line ? lineToSan(line.moves) : []),
    [line],
  );

  /** FEN at each cursor position along the selected line — used to render
   * chip SAN for alternative continuations seen in sibling lines. */
  const fenAtPosition = useMemo(() => {
    const m = new Map<number, string>();
    let chess = chessFromFen(START_FEN);
    m.set(0, fenOf(chess));
    if (!line) return m;
    for (let i = 0; i < line.moves.length; i++) {
      chess = applyUci(chess, line.moves[i]);
      m.set(i + 1, fenOf(chess));
    }
    return m;
  }, [line]);

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
    recognizeOpening(line.moves, cursorIdx).then(found => {
      if (!cancelled) setRecognizedOpening(found);
    });
    return () => {
      cancelled = true;
    };
  }, [line, cursorIdx]);

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
    const existing = latest.lines.find(
      l =>
        l.id !== latestLine.id &&
        l.moves.length > cursorIdx &&
        l.moves[cursorIdx] === uci &&
        prefix.every((m, i) => l.moves[i] === m),
    );
    if (existing) {
      setSelectedLineId(existing.id);
      setCursorIdx(cursorIdx + 1);
      return;
    }

    const parent = parentForNewVariant(latest.lines, latestLine, cursorIdx);
    const variant: Line = {
      id: crypto.randomUUID(),
      name: 'Variante',
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <section className="space-y-4">
        <header>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100">
                ← Retour
              </Link>
              <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">
                {opening.name}
              </h1>
              <p className="text-sm text-zinc-500">
                {opening.color === 'white' ? 'Blancs' : 'Noirs'} ·{' '}
                {opening.lines.length} ligne{opening.lines.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
            <EngineToggle
              enabled={engineEnabled}
              isThinking={isThinking}
              evalText={evalText}
              onToggle={toggleEngine}
            />
            <button
              onClick={removeOpening}
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:border-red-900 hover:text-red-300"
            >
              Supprimer
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
            >
              Exporter
            </button>
            <Link
              to="/openings/$openingId/study"
              params={{ openingId: opening.id }}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
            >
              Réviser
            </Link>
          </div>
          </div>
          {/* Chip row: recognized opening name + YouTube search shortcut.
              The chip is always rendered (`invisible` fallback) so its
              appearance never shifts the board. The button sits in the same
              flex container — `min-w-0 flex-1` on the chip lets `truncate`
              clip long ECO names instead of forcing horizontal overflow. */}
          <div className="mt-1 flex items-center gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-xs text-zinc-500 ${
                recognizedOpening ? '' : 'invisible'
              }`}
              aria-hidden={recognizedOpening ? undefined : true}
            >
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                {recognizedOpening?.eco ?? 'A00'}
              </span>{' '}
              <span className="italic">{recognizedOpening?.name ?? ' '}</span>
            </p>
            <YoutubeSearchButton
              opening={recognizedOpening}
              color={opening.color}
            />
          </div>
        </header>

        <div className="mx-auto w-full max-w-[560px] space-y-3">
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
          <AnnotationPanel
            fen={currentFen}
            annotation={currentAnnotation}
            onPatch={patch => updateAnnotation(currentFen, patch)}
          />
        </div>
      </section>

      <aside className="flex flex-col gap-3">
        <div className="flex max-h-[640px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <div className="flex items-baseline justify-between border-b border-zinc-800 px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Ligne en cours
            </h2>
            <span className="text-[10px] text-zinc-600">
              (chip) = bascule de variante
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {line && rootLine ? (
              <SelectedLineView
                line={line}
                sans={sansOfSelected}
                fenAtPosition={fenAtPosition}
                trie={trie}
                cursorIdx={cursorIdx}
                nagsAlongLine={nagsAlongLine}
                onSetCursor={pos => setCursorIdx(pos)}
                onSwitchLine={(lineId, pos) => {
                  setSelectedLineId(lineId);
                  setCursorIdx(pos);
                }}
              />
            ) : (
              <p className="text-xs italic text-zinc-500">
                Ouverture vide. Jouez un coup pour commencer.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              onClick={() => setCursorIdx(0)}
              className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Début
            </button>
            <div className="flex gap-1">
              <button
                onClick={() => setCursorIdx(c => Math.max(0, c - 1))}
                className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Coup précédent"
              >
                ←
              </button>
              <button
                onClick={() =>
                  setCursorIdx(c => (line ? Math.min(line.moves.length, c + 1) : c))
                }
                className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Coup suivant"
              >
                →
              </button>
            </div>
            <button
              onClick={() =>
                setCursorIdx(c => (line ? line.moves.length : c))
              }
              className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Fin
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <button
              onClick={truncateAtCursor}
              disabled={!line || cursorIdx >= line.moves.length}
              title="Supprime tous les coups après la position courante dans la ligne en cours"
              className="rounded-md px-2 py-1 text-amber-400 hover:bg-amber-950/40 disabled:opacity-30"
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
              className="rounded-md px-2 py-1 text-red-400 hover:bg-red-950/40 disabled:opacity-30"
            >
              Supprimer la variante
            </button>
          </div>
        </div>
      </aside>

      {exportOpen && (
        <ExportPgnModal onClose={() => setExportOpen(false)} opening={opening} />
      )}
    </div>
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
    <div className="absolute -left-5 top-0 h-full w-2.5 overflow-hidden rounded-sm bg-zinc-800 ring-1 ring-zinc-700/40">
      <div
        className="absolute inset-x-0 bottom-0 bg-zinc-100 transition-[height] duration-500 ease-out"
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
    'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition';
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
        className={`${baseClass} cursor-not-allowed text-zinc-600`}
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
      className={`${baseClass} text-red-500 hover:bg-zinc-800 hover:text-red-400`}
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
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
        enabled
          ? 'border-sky-700/60 bg-sky-950/40 text-sky-200 hover:border-sky-600'
          : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
      }`}
    >
      <span className="font-medium">Engine</span>
      <span
        className={`h-1.5 w-1.5 rounded-full transition ${
          enabled
            ? isThinking
              ? 'animate-pulse bg-sky-400'
              : 'bg-sky-400'
            : 'bg-zinc-600'
        }`}
      />
      {enabled && evalText !== null && (
        <span
          className={`font-mono text-xs tabular-nums ${
            positive ? 'text-emerald-300' : 'text-red-300'
          }`}
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
        <p className="text-xs text-zinc-500">
          Compatible Lichess Study, ChessBase, Chessable. Inclut variantes,
          commentaires, NAGs et flèches.
        </p>
        <textarea
          readOnly
          value={pgn}
          rows={10}
          className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs text-zinc-100 focus:outline-none"
          onFocus={e => e.currentTarget.select()}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100"
          >
            Fermer
          </button>
          <button
            onClick={copy}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
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
  onSetCursor,
  onSwitchLine,
}: SelectedLineProps) {
  if (line.moves.length === 0) {
    return (
      <div className="py-3 font-mono text-sm">
        <button
          onClick={() => onSetCursor(0)}
          className={`rounded px-2 py-1 text-xs italic transition ${
            cursorIdx === 0
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-500 hover:bg-zinc-800'
          }`}
        >
          (position initiale — jouez un coup)
        </button>
      </div>
    );
  }

  const tailPos = line.moves.length;
  const trailing = continuationsAt(trie, line, tailPos);
  const totalPairs = Math.ceil(line.moves.length / 2);
  // If the line ends after black (even total length) and there's still a known
  // continuation, we need a fresh row for that trailing white chip.
  const needsTrailingRow = trailing.length > 0 && tailPos % 2 === 0;
  const pairsToRender = totalPairs + (needsTrailingRow ? 1 : 0);

  const rows: React.ReactNode[] = [];
  for (let pairIdx = 0; pairIdx < pairsToRender; pairIdx++) {
    const moveNum = pairIdx + 1;
    const whitePos = pairIdx * 2;
    const blackPos = whitePos + 1;
    const isEven = pairIdx % 2 === 0;

    rows.push(
      <Fragment key={pairIdx}>
        <div
          className={`select-none px-3 py-1.5 text-right text-zinc-500 ${
            isEven ? 'bg-zinc-900/30' : ''
          }`}
        >
          {moveNum}.
        </div>
        <MoveCell
          line={line}
          sans={sans}
          pos={whitePos}
          tailPos={tailPos}
          trie={trie}
          trailing={trailing}
          fenAtPosition={fenAtPosition}
          cursorIdx={cursorIdx}
          nag={nagsAlongLine.get(whitePos)}
          onSetCursor={onSetCursor}
          onSwitchLine={onSwitchLine}
          shaded={isEven}
        />
        <MoveCell
          line={line}
          sans={sans}
          pos={blackPos}
          tailPos={tailPos}
          trie={trie}
          trailing={trailing}
          fenAtPosition={fenAtPosition}
          cursorIdx={cursorIdx}
          nag={nagsAlongLine.get(blackPos)}
          onSetCursor={onSetCursor}
          onSwitchLine={onSwitchLine}
          shaded={isEven}
        />
      </Fragment>,
    );
  }

  return (
    <div className="grid grid-cols-[auto_1fr_1fr] overflow-hidden rounded-md font-mono text-sm">
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
      className={`border-l border-zinc-800/60 px-3 py-1.5 ${
        shaded ? 'bg-zinc-900/30' : ''
      }`}
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
                className={`font-mono text-xs leading-none ${NAG_COLORS[nag]}`}
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
      className={`rounded px-1 font-medium transition ${
        isCursor
          ? 'bg-zinc-100 text-zinc-900'
          : 'text-zinc-100 hover:bg-zinc-800'
      }`}
    >
      {san}
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Note pour cette position
        </span>
        <div className="flex gap-0.5">
          {NAG_ORDER.map(n => (
            <button
              key={n}
              onClick={() => toggleNag(n)}
              title={NAG_LABELS[n]}
              className={`rounded px-1.5 py-0.5 font-mono text-xs leading-none transition ${
                currentNag === n
                  ? `${NAG_COLORS[n]} bg-zinc-800 ring-1 ring-inset ring-zinc-700`
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {NAG_SYMBOLS[n]}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={draftComment}
        onChange={e => setDraftComment(e.target.value)}
        onBlur={onCommentBlur}
        placeholder="Idée du coup, plan, faiblesse à exploiter…"
        rows={2}
        className="mt-2 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          {arrowsCount > 0
            ? `${arrowsCount} forme${arrowsCount > 1 ? 's' : ''} sur le plateau`
            : 'Clic-droit-glisser pour dessiner des flèches'}
        </span>
        {arrowsCount > 0 && (
          <button
            onClick={clearArrows}
            className="text-amber-400 hover:text-amber-300"
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
      className="cursor-pointer italic text-zinc-500 transition hover:text-zinc-200"
    >
      ({san})
    </button>
  );
}
