import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
import { NagSquareBadge } from '../components/NagSquareBadge';
import {
  applyUci,
  chessFromFen,
  fenOf,
  legalDests,
  lineToSan,
  START_FEN,
  turnColor,
  uciFromMove,
  uciToSanAt,
} from '../domain/chess';
import { NAG_COLORS, NAG_LABELS, NAG_ORDER, NAG_SYMBOLS } from '../domain/nag';
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
  const currentAnnotation = opening.annotations?.[currentFen];

  /** NAG per ply index in the current line — fed to the scoresheet so the
   * judgement glyph shows next to the move that earned it. */
  const nagsAlongLine = useMemo(() => {
    const m = new Map<number, Nag>();
    if (!line) return m;
    for (let i = 0; i < line.moves.length; i++) {
      const f = fenAtPosition.get(i + 1);
      if (!f) continue;
      const nag = opening.annotations?.[f]?.nag;
      if (nag !== undefined) m.set(i, nag);
    }
    return m;
  }, [line, fenAtPosition, opening.annotations]);

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
   * Apply a partial patch to the annotation at `fen`. The merge happens
   * against the freshest existing annotation read from the repo, not against
   * whatever the caller saw in its closure — so two writers updating
   * different fields of the same annotation (typical: arrows from
   * chessground vs comment/NAG from the panel) can't clobber each other.
   */
  const updateAnnotation = (fen: string, patch: Partial<Annotation>) => {
    updateOpening(latest => {
      const existing = latest.annotations?.[fen] ?? {};
      const merged: Annotation = { ...existing, ...patch };
      const isEmpty =
        (!merged.comment || !merged.comment.trim()) &&
        merged.nag === undefined &&
        (!merged.arrows || merged.arrows.length === 0);
      const next: Record<string, Annotation> = {
        ...(latest.annotations ?? {}),
      };
      if (isEmpty) delete next[fen];
      else next[fen] = merged;
      return { ...latest, annotations: next };
    });
  };

  const playMove = (uci: string) => {
    if (!line) return;
    if (line.moves[cursorIdx] === uci) {
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
  }, [chess, opening, line, cursorIdx, selectedLineId, currentAnnotation, currentFen]);

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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100">
              ← Retour
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{opening.name}</h1>
            <p className="text-sm text-zinc-500">
              {opening.color === 'white' ? 'Blancs' : 'Noirs'} ·{' '}
              {opening.lines.length} ligne{opening.lines.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={removeOpening}
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:border-red-900 hover:text-red-300"
            >
              Supprimer
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

        <div className="mx-auto w-full max-w-[560px] space-y-3">
          <div className="relative">
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
    </div>
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
