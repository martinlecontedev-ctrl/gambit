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
} from '../domain/chess';
import type { Opening } from '../domain/types';
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
            const nextLines = opening.lines.map(l =>
              l.id === selectedLineId
                ? { ...l, moves: [...l.moves.slice(0, cursorIdx), uci] }
                : l,
            );
            openingsRepo.save({ ...opening, lines: nextLines, updatedAt: Date.now() });
            setCursorIdx(cursorIdx + 1);
          },
        },
      },
      animation: { enabled: true, duration: 200 },
      draggable: { showGhost: true },
      drawable: { enabled: true },
    };
  }, [chess, opening, line, cursorIdx, selectedLineId]);

  const sanMoves = useMemo(() => (line ? lineToSan(line.moves) : []), [line]);

  const addLine = () => {
    const id = crypto.randomUUID();
    openingsRepo.save({
      ...opening,
      lines: [
        ...opening.lines,
        { id, name: `Ligne ${opening.lines.length + 1}`, moves: [] },
      ],
      updatedAt: Date.now(),
    });
    setSelectedLineId(id);
    setCursorIdx(0);
  };

  const deleteLine = (id: string) => {
    openingsRepo.save({
      ...opening,
      lines: opening.lines.filter(l => l.id !== id),
      updatedAt: Date.now(),
    });
  };

  const renameLine = (id: string, name: string) => {
    openingsRepo.save({
      ...opening,
      lines: opening.lines.map(l => (l.id === id ? { ...l, name } : l)),
      updatedAt: Date.now(),
    });
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
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

      <aside className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-300">Lignes</h2>
            <button
              onClick={addLine}
              className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-white"
            >
              + Nouvelle
            </button>
          </div>
          <ul className="space-y-1">
            {opening.lines.map(l => (
              <li key={l.id}>
                <button
                  onClick={() => {
                    setSelectedLineId(l.id);
                    setCursorIdx(l.moves.length);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                    l.id === selectedLineId
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <span className="truncate">{l.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-zinc-500">
                    {l.moves.length} coup{l.moves.length > 1 ? 's' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {line && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <input
                value={line.name}
                onChange={e => renameLine(line.id, e.target.value)}
                className="flex-1 rounded-md bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:outline-none"
              />
              {opening.lines.length > 1 && (
                <button
                  onClick={() => deleteLine(line.id)}
                  className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
                >
                  Supprimer
                </button>
              )}
            </div>

            <p className="mb-3 text-xs text-zinc-500">
              Cliquez sur un coup pour y revenir. Jouez sur l'échiquier pour en ajouter.
            </p>

            {sanMoves.length === 0 ? (
              <p className="rounded-md bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500">
                Ligne vide. Jouez le premier coup.
              </p>
            ) : (
              <ol className="grid grid-cols-[auto_1fr_1fr] items-baseline gap-x-2 gap-y-1 font-mono text-sm">
                {Array.from({ length: Math.ceil(sanMoves.length / 2) }, (_, i) => {
                  const wIdx = i * 2;
                  const bIdx = i * 2 + 1;
                  return (
                    <Fragment key={i}>
                      <span className="text-zinc-500">{i + 1}.</span>
                      <MoveButton
                        san={sanMoves[wIdx]}
                        active={cursorIdx === wIdx + 1}
                        onClick={() => setCursorIdx(wIdx + 1)}
                      />
                      {sanMoves[bIdx] ? (
                        <MoveButton
                          san={sanMoves[bIdx]}
                          active={cursorIdx === bIdx + 1}
                          onClick={() => setCursorIdx(bIdx + 1)}
                        />
                      ) : (
                        <span />
                      )}
                    </Fragment>
                  );
                })}
              </ol>
            )}

            <div className="mt-4 flex items-center justify-between gap-2 text-xs">
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
                >
                  ←
                </button>
                <button
                  onClick={() => setCursorIdx(c => Math.min(line.moves.length, c + 1))}
                  className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  →
                </button>
              </div>
              <button
                onClick={truncateAtCursor}
                disabled={cursorIdx >= line.moves.length}
                className="rounded-md px-2 py-1 text-amber-400 hover:bg-amber-950/40 disabled:opacity-30"
              >
                Couper ici
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function MoveButton({
  san,
  active,
  onClick,
}: {
  san: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-left transition ${
        active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {san}
    </button>
  );
}
