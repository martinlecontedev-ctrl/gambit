import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
import { FigurineSan } from '../components/FigurineSan';
import { NagSquareBadge } from '../components/NagSquareBadge';
import {
  applyUci,
  chessFromFen,
  fenOf,
  legalDests,
  positionKey,
  sameMove,
  START_FEN,
  turnColor,
  uciFromMove,
  uciToSanAt,
} from '../domain/chess';
import { buildCards } from '../domain/cards';
import { NAG_COLORS, NAG_LABELS, NAG_SYMBOLS } from '../domain/nag';
import { review, type Grade } from '../domain/srs';
import type { Card, Opening } from '../domain/types';
import { cardsRepo, openingsRepo, reviewsRepo } from '../storage/repository';
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
    const now = Date.now();
    return buildCards(opening, storedCards, now).filter(c => c.due <= now);
  }, [opening, storedCards]);

  if (!opening) return <NotFound />;
  if (dueQueue.length === 0) return <NothingDue openingId={opening.id} />;
  return <StudySession key={opening.id} opening={opening} initialQueue={dueQueue} />;
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

function NothingDue({ openingId }: { openingId: string }) {
  return (
    <main className="mx-auto max-w-md px-10 py-16 text-center">
      <p className="text-2xl font-bold">Tout est à jour.</p>
      <p className="mt-2 text-sm text-meta">Rien à réviser pour le moment.</p>
      <div className="mt-8 flex justify-center gap-2.5">
        <Link
          to="/openings/$openingId/edit"
          params={{ openingId }}
          className="flex h-11 items-center rounded-btn border border-line-strong bg-surface-high px-4.5 text-sm font-semibold text-ink transition hover:bg-field"
        >
          Éditer
        </Link>
        <Link
          to="/"
          className="btn-accent flex h-11 items-center rounded-btn px-5 text-sm font-semibold"
        >
          Retour
        </Link>
      </div>
    </main>
  );
}

type Phase = 'awaiting' | 'revealed' | 'correct' | 'wrong';

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

  const chess = useMemo(
    () => (card ? chessFromFen(card.fen) : chessFromFen(START_FEN)),
    [card],
  );
  const expectedUci = card?.expectedUci;

  /** Chapter the current card lives in. Surfaced in the right panel so the
   * user always knows which storyline they're being tested on — a card from
   * the "Najdorf English" chapter shouldn't be answered with the move from
   * the "Najdorf Be3" chapter. */
  const currentChapterName = useMemo(() => {
    if (!card) return null;
    return (
      opening.chapters.find(c => c.id === card.chapterId)?.name ?? null
    );
  }, [card, opening.chapters]);

  // While the user is being asked the question we show the position before
  // the move. After they answer (right or wrong) we reveal the expected
  // continuation so they see how the position should look.
  const showAnswer = phase !== 'awaiting' && expectedUci;
  const displayChess = useMemo(
    () => (showAnswer && expectedUci ? applyUci(chess, expectedUci) : chess),
    [chess, showAnswer, expectedUci],
  );
  // While choosing: highlight the opponent's last move (the move that reached
  // this position) so the user can see what was played even if they missed the
  // animation. After answering: highlight the revealed expected move.
  const displayLastMove = showAnswer ? expectedUci : card?.lastMove;

  /** The annotation lives on the position *after* the expected move, so it
   * comes into view together with the answer reveal. We look it up by the
   * canonical position key and fall back to any legacy full-FEN entry so
   * transpositions and pre-migration data both resolve. */
  const annotation = useMemo(() => {
    if (!showAnswer) return undefined;
    const target = fenOf(displayChess);
    const key = positionKey(target);
    const direct = opening.annotations?.[key];
    if (direct) return direct;
    if (opening.annotations) {
      for (const k of Object.keys(opening.annotations)) {
        if (positionKey(k) === key) return opening.annotations[k];
      }
    }
    return undefined;
  }, [opening.annotations, showAnswer, displayChess]);

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
            const correct = expectedUci !== undefined && sameMove(chess, uci, expectedUci);
            setPhase(correct ? 'correct' : 'wrong');
          },
        },
      },
      animation: { enabled: true, duration: 200 },
      draggable: { showGhost: true },
      drawable: {
        enabled: false,
        visible: true,
        autoShapes: annotation?.arrows
          ? annotation.arrows.map(a => ({
              orig: a.orig as Key,
              dest: a.dest as Key | undefined,
              brush: a.brush,
            }))
          : [],
      },
    };
  }, [
    chess,
    displayChess,
    displayLastMove,
    opening.color,
    phase,
    expectedUci,
    card,
    annotation,
  ]);

  if (finished) {
    return (
      <main className="mx-auto max-w-md px-10 py-16 text-center">
        <p className="text-2xl font-bold">Session terminée.</p>
        <p className="mt-2 text-sm text-meta">
          {stats.pass} bonne{stats.pass > 1 ? 's' : ''} ·{' '}
          {stats.fail} erreur{stats.fail > 1 ? 's' : ''}
        </p>
        <div className="mt-8 flex justify-center gap-2.5">
          <Link
            to="/"
            className="btn-accent flex h-11 items-center rounded-btn px-5 text-sm font-semibold"
          >
            Retour
          </Link>
        </div>
      </main>
    );
  }

  const grade = (g: Grade) => {
    if (!card) return;
    const updated = review(card, g);
    cardsRepo.upsert({ ...card, ...updated });
    reviewsRepo.append({
      ts: Date.now(),
      cardId: card.id,
      openingId: opening.id,
      grade: g,
    });
    setStats(s => ({
      pass: s.pass + (g >= 3 ? 1 : 0),
      fail: s.fail + (g < 3 ? 1 : 0),
    }));
    setIdx(i => i + 1);
    setPhase('awaiting');
  };

  const sessionPct = queue.length ? Math.round((idx / queue.length) * 100) : 0;
  const remaining = queue.length - idx;
  const expectedSan =
    expectedUci ? uciToSanAt(fenOf(chess), expectedUci) : '—';
  const comment = annotation?.comment?.trim();
  const nagGlyph =
    annotation?.nag !== undefined ? (
      <span
        className={`text-base font-bold leading-none ${NAG_COLORS[annotation.nag]}`}
        title={NAG_LABELS[annotation.nag]}
      >
        {NAG_SYMBOLS[annotation.nag]}
      </span>
    ) : null;

  return (
    <main className="mx-auto max-w-300 px-10 pt-6 pb-17.5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-meta transition hover:text-ink"
        >
          ← Sortir
        </Link>
        <div className="flex w-95 max-w-full items-center gap-3">
          <div className="h-1.75 flex-1 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${sessionPct}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-[13px] font-semibold text-ink-muted tnum">
            {idx + 1} / {queue.length}
          </span>
        </div>
      </div>

      <div className="grid items-start gap-11 lg:grid-cols-[1fr_380px]">
        <section className="mx-auto flex w-full max-w-140 flex-col items-center gap-4">
          <div className="relative w-full">
            <Chessboard config={config} />
            {showAnswer && annotation?.nag !== undefined && expectedUci && (
              <NagSquareBadge
                nag={annotation.nag}
                square={expectedUci.slice(2, 4)}
                orientation={opening.color}
              />
            )}
          </div>

          <div className="w-full rounded-[14px] border border-line bg-surface px-5 py-4.5 shadow-card">
            {phase === 'awaiting' && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-bold text-ink">Jouez le coup attendu</p>
                <button
                  onClick={() => setPhase('revealed')}
                  className="h-10.5 shrink-0 rounded-[10px] border border-line-strong bg-surface-high px-4.5 text-sm font-semibold text-ink transition hover:bg-field"
                >
                  Révéler
                </button>
              </div>
            )}
            {phase === 'correct' && (
              <>
                <div className="mb-3.5 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[17px] font-bold text-success">
                    Correct.
                    {nagGlyph}
                  </span>
                  <span className="text-[13.5px] text-meta">Évaluez votre rappel</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <GradeButton onClick={() => grade(3)} label="Difficile" tone="warning" />
                  <GradeButton onClick={() => grade(4)} label="Bien" tone="success" />
                  <GradeButton onClick={() => grade(5)} label="Facile" tone="info" />
                </div>
                {comment && (
                  <p className="mt-3.5 border-l-2 border-line pl-3 text-sm italic text-ink-soft">
                    {comment}
                  </p>
                )}
              </>
            )}
            {phase === 'revealed' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-bold text-warning-text">Révélé.</span>
                  {nagGlyph}
                </div>
                <p className="mt-2 text-[13px] text-meta">
                  Coup attendu :{' '}
                  <span className="font-semibold text-ink tnum">
                    <FigurineSan san={expectedSan} />
                  </span>
                </p>
                {comment && (
                  <p className="mt-2 border-l-2 border-line pl-3 text-sm italic text-ink-soft">
                    {comment}
                  </p>
                )}
                <button
                  onClick={() => grade(0)}
                  className="mt-3.5 w-full rounded-[10px] border border-warning-border bg-warning-soft py-3 text-sm font-semibold text-warning-text transition hover:brightness-[0.98]"
                >
                  Continuer
                </button>
              </>
            )}
            {phase === 'wrong' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-bold text-danger">Erreur.</span>
                  {nagGlyph}
                </div>
                <p className="mt-2 text-[13px] text-meta">
                  Coup attendu :{' '}
                  <span className="font-semibold text-ink tnum">
                    <FigurineSan san={expectedSan} />
                  </span>
                </p>
                {comment && (
                  <p className="mt-2 border-l-2 border-line pl-3 text-sm italic text-ink-soft">
                    {comment}
                  </p>
                )}
                <button
                  onClick={() => grade(0)}
                  className="mt-3.5 w-full rounded-[10px] border border-danger-border bg-danger-soft py-3 text-sm font-semibold text-danger-text transition hover:brightness-[0.98]"
                >
                  Continuer
                </button>
              </>
            )}
          </div>
        </section>

        <aside className="flex w-full flex-col gap-4">
          <div className="rounded-card border border-line bg-surface p-5.5 shadow-card">
            <div className="text-[21px] font-extrabold tracking-[-0.01em]">
              {opening.name}
            </div>
            <div className="mt-1 text-sm text-meta">
              {opening.color === 'white' ? 'Trait aux blancs' : 'Trait aux noirs'}
            </div>
            {currentChapterName && (
              <div className="mt-4 border-t border-line pt-4">
                <span
                  className="inline-flex max-w-full items-center gap-1.75 rounded-full border border-accent-soft-border bg-accent-soft px-2.75 py-1.25 text-[12.5px] font-semibold text-accent-soft-text"
                  title={currentChapterName}
                >
                  <span className="h-1.75 w-1.75 shrink-0 rounded-full bg-accent-dot" />
                  <span className="truncate">{currentChapterName}</span>
                </span>
              </div>
            )}
          </div>

          <div className="rounded-card border border-line bg-surface px-5 py-4.5 shadow-card">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
              Cette session
            </div>
            <div className="flex gap-5.5">
              <div>
                <div className="text-[26px] font-extrabold leading-none text-success">
                  {stats.pass}
                </div>
                <div className="mt-1 text-[12.5px] text-meta">bonnes</div>
              </div>
              <div>
                <div className="text-[26px] font-extrabold leading-none text-danger">
                  {stats.fail}
                </div>
                <div className="mt-1 text-[12.5px] text-meta">erreurs</div>
              </div>
              <div>
                <div className="text-[26px] font-extrabold leading-none text-accent">
                  {remaining}
                </div>
                <div className="mt-1 text-[12.5px] text-meta">restantes</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function GradeButton({
  onClick,
  label,
  tone,
}: {
  onClick: () => void;
  label: string;
  tone: 'warning' | 'success' | 'info';
}) {
  const tones = {
    warning: 'border-warning-border bg-warning-soft text-warning-text',
    success: 'border-success-border bg-success-soft text-success',
    info: 'border-info-border bg-info-soft text-info',
  } as const;
  return (
    <button
      onClick={onClick}
      className={`h-12 rounded-btn border text-[14.5px] font-bold transition hover:brightness-[0.97] ${tones[tone]}`}
    >
      {label}
    </button>
  );
}
