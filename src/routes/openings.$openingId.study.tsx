import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { Chess } from 'chessops/chess';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
import {
  applyUci,
  chessFromFen,
  fenOf,
  legalDests,
  START_FEN,
  turnColor,
  uciFromMove,
  uciToSanAt,
} from '../domain/chess';
import { newCardStats, review, type Grade } from '../domain/srs';
import type { Card, Opening } from '../domain/types';
import { cardsRepo, openingsRepo } from '../storage/repository';
import { useStored } from '../storage/store';

export const Route = createFileRoute('/openings/$openingId/study')({ component: Study });

function Study() {
  const { openingId } = Route.useParams();
  const opening = useStored(() => openingsRepo.get(openingId));
  const allCards = useStored(() => cardsRepo.list());
  const storedCards = useMemo(
    () => allCards.filter(c => c.openingId === openingId),
    [allCards, openingId],
  );
  return <StudyImpl opening={opening} storedCards={storedCards} />;
}

function StudyImpl({
  opening,
  storedCards,
}: {
  opening: Opening | undefined;
  storedCards: Card[];
}) {
  const dueQueue = useMemo(() => {
    if (!opening) return [];
    return buildCards(opening, storedCards).filter(c => c.due <= Date.now());
  }, [opening, storedCards]);

  if (!opening) return <NotFound />;
  if (dueQueue.length === 0) return <NothingDue openingId={opening.id} />;
  return <StudySession key={opening.id} opening={opening} initialQueue={dueQueue} />;
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

function NothingDue({ openingId }: { openingId: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-2xl">Tout est à jour.</p>
      <p className="mt-2 text-sm text-zinc-500">Rien à réviser pour le moment.</p>
      <div className="mt-8 flex justify-center gap-2">
        <Link
          to="/openings/$openingId/edit"
          params={{ openingId }}
          className="rounded-lg border border-zinc-800 px-4 py-2 text-sm hover:bg-zinc-900"
        >
          Éditer
        </Link>
        <Link
          to="/"
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          Retour
        </Link>
      </div>
    </div>
  );
}

function buildCards(opening: Opening, stored: Card[]): Card[] {
  const byId = new Map(stored.map(c => [c.id, c]));
  const out: Card[] = [];
  const startsAt = opening.color === 'white' ? 0 : 1;
  for (const line of opening.lines) {
    for (let i = startsAt; i < line.moves.length; i += 2) {
      const id = `${opening.id}:${line.id}:${i}`;
      out.push(
        byId.get(id) ?? {
          ...newCardStats(),
          id,
          openingId: opening.id,
          lineId: line.id,
          plyIdx: i,
        },
      );
    }
  }
  return out;
}

function positionAtCard(opening: Opening, card: Card): { chess: Chess; lastMoveUci?: string } {
  const line = opening.lines.find(l => l.id === card.lineId);
  let c = chessFromFen(START_FEN);
  let last: string | undefined;
  if (!line) return { chess: c };
  for (let i = 0; i < card.plyIdx; i++) {
    last = line.moves[i];
    c = applyUci(c, last);
  }
  return { chess: c, lastMoveUci: last };
}

type Phase = 'awaiting' | 'correct' | 'wrong';

function StudySession({
  opening,
  initialQueue,
}: {
  opening: Opening;
  initialQueue: Card[];
}) {
  const [queue] = useState(initialQueue);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('awaiting');
  const [stats, setStats] = useState({ pass: 0, fail: 0 });

  const finished = idx >= queue.length;
  const card = finished ? undefined : queue[idx];

  const { chess, lastMoveUci } = useMemo(
    () => (card ? positionAtCard(opening, card) : { chess: chessFromFen(START_FEN) }),
    [opening, card],
  );

  const line = card ? opening.lines.find(l => l.id === card.lineId) : undefined;
  const expectedUci = card && line ? line.moves[card.plyIdx] : undefined;

  // While the user is being asked the question we show the position before
  // the move. After they answer (right or wrong) we reveal the expected
  // continuation so they see how the position should look.
  const showAnswer = phase !== 'awaiting' && expectedUci;
  const displayChess = useMemo(
    () => (showAnswer && expectedUci ? applyUci(chess, expectedUci) : chess),
    [chess, showAnswer, expectedUci],
  );
  const displayLastMove = showAnswer ? expectedUci : lastMoveUci;

  const config: Config = useMemo(() => {
    if (!card) return {};
    const interactive = phase === 'awaiting';
    return {
      fen: fenOf(displayChess),
      orientation: opening.color,
      turnColor: turnColor(displayChess),
      lastMove: displayLastMove
        ? [displayLastMove.slice(0, 2) as Key, displayLastMove.slice(2, 4) as Key]
        : undefined,
      movable: {
        free: false,
        color: interactive ? opening.color : undefined,
        dests: interactive ? legalDests(displayChess) : new Map(),
        events: {
          after: (orig: Key, dest: Key) => {
            if (!interactive) return;
            const uci = uciFromMove(chess, orig, dest);
            setPhase(uci === expectedUci ? 'correct' : 'wrong');
          },
        },
      },
      animation: { enabled: true, duration: 200 },
      draggable: { showGhost: true },
    };
  }, [chess, displayChess, displayLastMove, opening.color, phase, expectedUci, card]);

  if (finished) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-2xl">Session terminée.</p>
        <p className="mt-2 text-sm text-zinc-500">
          {stats.pass} bonne{stats.pass > 1 ? 's' : ''} ·{' '}
          {stats.fail} erreur{stats.fail > 1 ? 's' : ''}
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <Link
            to="/"
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
          >
            Retour
          </Link>
        </div>
      </div>
    );
  }

  const grade = (g: Grade) => {
    if (!card) return;
    const updated = review(card, g);
    cardsRepo.upsert({ ...card, ...updated });
    setStats(s => ({
      pass: s.pass + (g >= 3 ? 1 : 0),
      fail: s.fail + (g < 3 ? 1 : 0),
    }));
    setIdx(i => i + 1);
    setPhase('awaiting');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100">
            ← Sortir
          </Link>
          <span className="text-sm text-zinc-500">
            {idx + 1} / {queue.length}
          </span>
        </div>

        <div className="mx-auto w-full max-w-[560px]">
          <Chessboard config={config} />
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-300">
            {opening.name}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {opening.color === 'white' ? 'Trait aux blancs' : 'Trait aux noirs'}
          </p>

          <div className="mt-5">
            {phase === 'awaiting' && (
              <p className="text-sm text-zinc-400">Jouez le coup attendu.</p>
            )}
            {phase === 'correct' && (
              <div>
                <p className="text-sm font-medium text-emerald-300">Correct.</p>
                <p className="mt-1 text-xs text-zinc-500">Évaluez votre rappel.</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <GradeButton onClick={() => grade(3)} label="Difficile" tone="amber" />
                  <GradeButton onClick={() => grade(4)} label="Bien" tone="emerald" />
                  <GradeButton onClick={() => grade(5)} label="Facile" tone="sky" />
                </div>
              </div>
            )}
            {phase === 'wrong' && (
              <div>
                <p className="text-sm font-medium text-red-300">Erreur.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Coup attendu :{' '}
                  <span className="font-mono text-zinc-200">
                    {expectedUci ? uciToSanAt(fenOf(chess), expectedUci) : '—'}
                  </span>
                </p>
                <button
                  onClick={() => grade(0)}
                  className="mt-4 w-full rounded-lg bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-900/60"
                >
                  Continuer
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-xs text-zinc-500">
          <span className="font-medium text-zinc-300">{stats.pass}</span> bonnes ·{' '}
          <span className="font-medium text-zinc-300">{stats.fail}</span> erreurs
        </div>
      </aside>
    </div>
  );
}

function GradeButton({
  onClick,
  label,
  tone,
}: {
  onClick: () => void;
  label: string;
  tone: 'amber' | 'emerald' | 'sky';
}) {
  const tones = {
    amber: 'bg-amber-950/40 text-amber-200 hover:bg-amber-900/60',
    emerald: 'bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/60',
    sky: 'bg-sky-950/40 text-sky-200 hover:bg-sky-900/60',
  } as const;
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-medium transition ${tones[tone]}`}
    >
      {label}
    </button>
  );
}
