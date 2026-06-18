import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
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
import {
  buildPrefixTrie,
  continuationsAt,
  effectiveParentId,
  parentForNewVariant,
} from '../domain/tree';
import type { Line, Opening } from '../domain/types';
import { openingsRepo } from '../storage/repository';
import { useStored } from '../storage/store';

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

  const playMove = (uci: string) => {
    if (!line) return;
    // Same continuation as the current line — just advance.
    if (line.moves[cursorIdx] === uci) {
      setCursorIdx(cursorIdx + 1);
      return;
    }
    // At the end of the current line: extend it. (Even if a sibling already
    // has the same continuation, stay in the user's chosen line.)
    if (cursorIdx === line.moves.length) {
      openingsRepo.save({
        ...opening,
        lines: opening.lines.map(l =>
          l.id === line.id ? { ...l, moves: [...l.moves, uci] } : l,
        ),
        updatedAt: Date.now(),
      });
      setCursorIdx(cursorIdx + 1);
      return;
    }
    // Mid-line. If some other line already takes this continuation from the
    // same prefix, switch to it rather than creating a duplicate.
    const prefix = line.moves.slice(0, cursorIdx);
    const existing = opening.lines.find(
      l =>
        l.id !== line.id &&
        l.moves.length > cursorIdx &&
        l.moves[cursorIdx] === uci &&
        prefix.every((m, i) => l.moves[i] === m),
    );
    if (existing) {
      setSelectedLineId(existing.id);
      setCursorIdx(cursorIdx + 1);
      return;
    }
    // Otherwise create a variant whose parent is the ancestor that still
    // owns the position right before the cursor.
    const parent = parentForNewVariant(opening.lines, line, cursorIdx);
    const variant: Line = {
      id: crypto.randomUUID(),
      name: 'Variante',
      parentLineId: parent.id,
      moves: [...prefix, uci],
    };
    openingsRepo.save({
      ...opening,
      lines: [...opening.lines, variant],
      updatedAt: Date.now(),
    });
    setSelectedLineId(variant.id);
    setCursorIdx(prefix.length + 1);
  };

  const config: Config = useMemo(() => {
    const lastMoveUci = cursorIdx > 0 && line ? line.moves[cursorIdx - 1] : undefined;
    const tc = turnColor(chess);
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
      drawable: { enabled: true },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, opening, line, cursorIdx, selectedLineId]);

  /** Delete a line and re-parent its children to its own parent (no orphans). */
  const deleteLine = (id: string) => {
    const deleted = opening.lines.find(l => l.id === id);
    if (!deleted) return;
    const nextLines = opening.lines
      .filter(l => l.id !== id)
      .map(l =>
        l.parentLineId === id ? { ...l, parentLineId: deleted.parentLineId } : l,
      );
    openingsRepo.save({ ...opening, lines: nextLines, updatedAt: Date.now() });
  };

  const truncateAtCursor = () => {
    if (!line) return;
    openingsRepo.save({
      ...opening,
      lines: opening.lines.map(l =>
        l.id === selectedLineId ? { ...l, moves: l.moves.slice(0, cursorIdx) } : l,
      ),
      updatedAt: Date.now(),
    });
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

        <div className="mx-auto w-full max-w-[560px]">
          <Chessboard config={config} />
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
          <SelectedMove
            san={sans[pos] ?? line.moves[pos]}
            isCursor={cursorIdx === pos + 1}
            onClick={() => onSetCursor(pos + 1)}
          />
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
