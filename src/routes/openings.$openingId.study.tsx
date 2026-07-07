import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
import { FigurineSan } from '../components/FigurineSan';
import { NagSquareBadge } from '../components/NagSquareBadge';
import { OpeningNotFound } from '../components/opening/OpeningNotFound';
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
import { buildCards, coverCardInReviewRanges, openingStats } from '../domain/cards';
import { NAG_COLORS, NAG_LABELS, NAG_SYMBOLS } from '../domain/nag';
import { newCardStats, review, type Grade } from '../domain/srs';
import type { Card, Chapter, Opening } from '../domain/types';
import { cardsRepo, openingsRepo, reviewsRepo } from '../storage/repository';
import { useStored } from '../storage/store';

/** One entry of the program's opening queue (review-all mode). */
type OpeningFileItem = { id: string; name: string; due: number };

/** Outcome of one review for the session counters. A reveal is a recall miss
 * (graded 0, same SRS effect as a wrong move) but tallied on its own. */
type ReviewOutcome = 'pass' | 'fail' | 'revealed';

type StudySearch = { program: boolean; pos?: string };

export const Route = createFileRoute('/openings/$openingId/study')({
  component: Study,
  // `program` = launched from the home banner: review every due opening, not
  // just this one. Drives the opening queue shown on top.
  // `pos` = exercise mode (deep link from the Lichess deviations tab): drill
  // only the cards of that position key, due or not.
  validateSearch: (search: Record<string, unknown>): StudySearch => ({
    program: search.program === true || search.program === 'true',
    pos: typeof search.pos === 'string' && search.pos ? search.pos : undefined,
  }),
});

function Study() {
  const { openingId } = Route.useParams();
  const { program, pos } = Route.useSearch();
  const opening = useStored(() => openingsRepo.get(openingId));
  const openings = useStored(() => openingsRepo.list());
  const allCards = useStored(() => cardsRepo.list());
  const storedCards = useMemo(
    () => allCards.filter(c => c.openingId === openingId),
    [allCards, openingId],
  );

  // Program mode: the queue of openings still due, in list order, so the user
  // sees where they are and what's next. The current opening is always kept
  // (stays highlighted even once it's cleared and sits on its done screen).
  const programNow = useMemo(() => Date.now(), []);
  const openingsFile = useMemo<OpeningFileItem[] | undefined>(() => {
    if (!program) return undefined;
    return openings
      .map(o => ({
        id: o.id,
        name: o.name,
        due: openingStats(
          o,
          allCards.filter(c => c.openingId === o.id),
          programNow,
        ).due,
      }))
      .filter(o => o.due > 0 || o.id === openingId);
  }, [program, openings, allCards, openingId, programNow]);

  const nextOpening = openingsFile?.find(o => o.id !== openingId && o.due > 0);

  // Session score lives here (the route component), so it survives both chapter
  // switches and program opening-to-opening navigation (TanStack reuses this
  // component across param changes). It resets only when the study route is
  // left and re-entered — i.e. a fresh session, program or single opening.
  const [stats, setStats] = useState({ pass: 0, fail: 0, revealed: 0 });
  const recordGrade = (outcome: ReviewOutcome) =>
    setStats(s => ({
      pass: s.pass + (outcome === 'pass' ? 1 : 0),
      fail: s.fail + (outcome === 'fail' ? 1 : 0),
      revealed: s.revealed + (outcome === 'revealed' ? 1 : 0),
    }));

  return (
    <StudyImpl
      key={openingId}
      opening={opening}
      storedCards={storedCards}
      exercisePos={pos}
      openingsFile={openingsFile}
      nextOpening={nextOpening}
      stats={stats}
      onGraded={recordGrade}
    />
  );
}

function StudyImpl({
  opening,
  storedCards,
  exercisePos,
  openingsFile,
  nextOpening,
  stats,
  onGraded,
}: {
  opening: Opening | undefined;
  storedCards: Card[];
  exercisePos: string | undefined;
  openingsFile: OpeningFileItem[] | undefined;
  nextOpening: OpeningFileItem | undefined;
  stats: { pass: number; fail: number; revealed: number };
  onGraded: (outcome: ReviewOutcome) => void;
}) {
  // Frozen at mount so due status (and the per-chapter counts) stay stable as
  // cards get rescheduled during the session.
  const now = useMemo(() => Date.now(), []);

  // Exercise mode: drill the exact cards of one position, due or not, review
  // windows bypassed — a move missed in a real game deserves a rep even if
  // it was windowed out of the daily drill. Built ONCE at mount (lazy init):
  // ReviewSession freezes its own queue anyway, so recomputing after every
  // grade would be pure waste.
  const [initialExercise] = useState(() => {
    if (!exercisePos || !opening) return undefined;
    const unwindowed = {
      ...opening,
      lines: opening.lines.map(l => ({ ...l, reviewRanges: undefined })),
    };
    const cards = buildCards(unwindowed, storedCards, now).filter(
      c => positionKey(c.fen) === exercisePos,
    );
    // A stale deep link (repertoire edited since the report) can point at a
    // position with no cards — fall back to a regular session instead of a
    // misleading "tout est à jour" exercise screen.
    return cards.length > 0 ? cards : undefined;
  });

  // Review is scoped to one chapter at a time. Group the due cards by chapter
  // so the rail can show per-chapter counts and the session can drill them
  // independently. Recomputes after each grade (storedCards changes), which
  // naturally trims the active chapter's badge in step with its queue.
  const dueByChapter = useMemo(() => {
    const m = new Map<string, Card[]>();
    if (!opening) return m;
    for (const c of buildCards(opening, storedCards, now)) {
      if (c.due <= now) {
        const arr = m.get(c.chapterId);
        if (arr) arr.push(c);
        else m.set(c.chapterId, [c]);
      }
    }
    return m;
  }, [opening, storedCards, now]);

  const sortedChapters = useMemo(
    () => (opening ? [...opening.chapters].sort((a, b) => a.order - b.order) : []),
    [opening],
  );

  const totalDue = useMemo(() => {
    let s = 0;
    for (const arr of dueByChapter.values()) s += arr.length;
    return s;
  }, [dueByChapter]);

  // First chapter with due cards — the session starts here (the exercised
  // card's chapter in exercise mode). Frozen on mount so the active chapter
  // doesn't silently jump as counts change; advancing is an explicit user
  // choice (rail click or the "next chapter" button).
  const [selectedChapterId, setSelectedChapterId] = useState<string>(
    () =>
      initialExercise?.[0]?.chapterId ??
      sortedChapters.find(c => (dueByChapter.get(c.id)?.length ?? 0) > 0)?.id ??
      sortedChapters[0]?.id ??
      '',
  );

  // Frozen at mount: grading the session's last card drops totalDue to 0, and
  // that must NOT yank the running session away — ReviewSession's own end
  // screen (session stats, next chapter / next opening links) handles it.
  const [hadDueAtMount] = useState(() =>
    initialExercise ? initialExercise.length > 0 : totalDue > 0,
  );

  // The exercise is consumed once: switching chapter mid-exercise falls
  // back to the regular due queue of the clicked chapter.
  const [exerciseActive, setExerciseActive] = useState(
    () => (initialExercise?.length ?? 0) > 0,
  );

  if (!opening) return <OpeningNotFound />;
  if (!hadDueAtMount) return <NothingDue openingId={opening.id} />;

  const activeChapterId =
    sortedChapters.find(c => c.id === selectedChapterId)?.id ??
    sortedChapters[0]?.id ??
    '';

  return (
    <ReviewSession
      key={activeChapterId}
      opening={opening}
      chapters={sortedChapters}
      dueByChapter={dueByChapter}
      activeChapterId={activeChapterId}
      onSelectChapter={id => {
        setExerciseActive(false);
        setSelectedChapterId(id);
      }}
      initialQueue={
        exerciseActive && initialExercise && initialExercise.length > 0
          ? initialExercise
          : dueByChapter.get(activeChapterId) ?? []
      }
      isExercise={exerciseActive && (initialExercise?.length ?? 0) > 0}
      openingDue={totalDue}
      openingsFile={openingsFile}
      nextOpening={nextOpening}
      stats={stats}
      onGraded={onGraded}
    />
  );
}

function NothingDue({ openingId }: { openingId: string }) {
  return (
    <main className="mx-auto max-w-md px-10 py-16 text-center">
      <p className="text-2xl font-bold">Tout est à jour.</p>
      <p className="mt-2 text-sm text-meta">Rien à réviser pour le moment.</p>
      <div className="mt-8 flex justify-center gap-2.5">
        <Link
          to="/openings/$openingId"
          params={{ openingId }}
          className="flex h-11 items-center rounded-btn border border-line-strong bg-surface-high px-4.5 text-sm font-semibold text-ink transition hover:bg-field"
        >
          Ouvrir
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

function ReviewSession({
  opening,
  chapters,
  dueByChapter,
  activeChapterId,
  onSelectChapter,
  initialQueue,
  isExercise,
  openingDue,
  openingsFile,
  nextOpening,
  stats,
  onGraded,
}: {
  opening: Opening;
  chapters: Chapter[];
  dueByChapter: Map<string, Card[]>;
  activeChapterId: string;
  onSelectChapter: (id: string) => void;
  initialQueue: Card[];
  isExercise: boolean;
  openingDue: number;
  openingsFile: OpeningFileItem[] | undefined;
  nextOpening: OpeningFileItem | undefined;
  stats: { pass: number; fail: number; revealed: number };
  onGraded: (outcome: ReviewOutcome) => void;
}) {
  const [queue] = useState(initialQueue);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('awaiting');

  const finished = idx >= queue.length;
  const card = finished ? undefined : queue[idx];

  const chess = useMemo(
    () => (card ? chessFromFen(card.fen) : chessFromFen(START_FEN)),
    [card],
  );
  const expectedUci = card?.expectedUci;

  const showAnswer = phase !== 'awaiting' && expectedUci;
  const displayChess = useMemo(
    () => (showAnswer && expectedUci ? applyUci(chess, expectedUci) : chess),
    [chess, showAnswer, expectedUci],
  );
  // While choosing: highlight the opponent's last move (the move that reached
  // this position). After answering: highlight the revealed expected move.
  const displayLastMove = showAnswer ? expectedUci : card?.lastMove;

  /** Annotation on the position *after* the expected move, resolved by
   * canonical position key (with a legacy full-FEN fallback). */
  const annotation = useMemo(() => {
    if (!showAnswer) return undefined;
    const key = positionKey(fenOf(displayChess));
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
    onGraded(g >= 3 ? 'pass' : phase === 'revealed' ? 'revealed' : 'fail');
    setIdx(i => i + 1);
    setPhase('awaiting');
  };

  const remaining = Math.max(0, queue.length - idx);
  // Program mode only: due left across every opening (the broadest scope).
  const programDue = openingsFile?.reduce((sum, o) => sum + o.due, 0);
  const sessionPct = queue.length ? Math.round((idx / queue.length) * 100) : 0;
  const counter = `${Math.min(idx + 1, queue.length)} / ${queue.length}`;
  // The badge follows the CURRENT card's chapter, not the session's: an
  // exercise queue can mix chapters that expect DIFFERENT replies on the
  // same position — the label is then the only clue to which theory is
  // being asked. Regular sessions are single-chapter, so nothing changes.
  const activeChapterName =
    chapters.find(c => c.id === (card?.chapterId ?? activeChapterId))?.name ?? '';
  const nextDueChapter = chapters.find(
    c => c.id !== activeChapterId && (dueByChapter.get(c.id)?.length ?? 0) > 0,
  );

  const expectedSan = expectedUci ? uciToSanAt(fenOf(chess), expectedUci) : '—';
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
    <main className="mx-auto max-w-325 px-10 pt-6 pb-17.5">
      {openingsFile && (
        <OpeningsFile items={openingsFile} activeId={opening.id} />
      )}
      <div className="mb-5 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-meta transition hover:text-ink"
        >
          ← Sortir
        </Link>
        <div className="flex w-85 max-w-full items-center gap-3">
          <div className="h-1.75 flex-1 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${sessionPct}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-[13px] font-semibold text-ink-muted tnum">
            {counter}
          </span>
        </div>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[240px_1fr_340px]">
        <ChapterRail
          chapters={chapters}
          dueByChapter={dueByChapter}
          activeId={activeChapterId}
          onSelect={onSelectChapter}
        />

        <section className="flex flex-col items-center">
          {card ? (
            <div className="flex w-full max-w-140 flex-col items-center gap-4">
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
                {(phase === 'revealed' || phase === 'wrong') && (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[17px] font-bold ${phase === 'revealed' ? 'text-warning-text' : 'text-danger'}`}
                      >
                        {phase === 'revealed' ? 'Révélé.' : 'Erreur.'}
                      </span>
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
                      className={`mt-3.5 w-full rounded-[10px] border py-3 text-sm font-semibold transition hover:brightness-[0.98] ${
                        phase === 'revealed'
                          ? 'border-warning-border bg-warning-soft text-warning-text'
                          : 'border-danger-border bg-danger-soft text-danger-text'
                      }`}
                    >
                      Continuer
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : isExercise ? (
            <ExerciseDone opening={opening} cards={queue} />
          ) : (
            <div className="flex w-full max-w-140 flex-col items-center rounded-[14px] border border-line bg-surface px-6 py-14 text-center shadow-card">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-2xl text-success">
                ✓
              </span>
              <p className="mt-4 text-lg font-bold">
                {nextDueChapter ? 'Chapitre à jour' : 'Ouverture à jour'}
              </p>
              <p className="mt-1 text-sm text-meta">
                {nextDueChapter
                  ? 'Passe au chapitre suivant ou choisis-en un autre à gauche.'
                  : nextOpening
                    ? `Au suivant dans le programme : ${nextOpening.name}.`
                    : 'Plus rien à réviser.'}
              </p>
              <div className="mt-6 flex justify-center gap-2.5">
                {nextDueChapter ? (
                  <button
                    onClick={() => onSelectChapter(nextDueChapter.id)}
                    className="btn-accent flex h-11 items-center rounded-btn px-5 text-sm font-semibold"
                  >
                    Chapitre suivant
                  </button>
                ) : openingsFile && nextOpening ? (
                  <Link
                    to="/openings/$openingId/study"
                    params={{ openingId: nextOpening.id }}
                    search={{ program: true }}
                    className="btn-accent flex h-11 items-center rounded-btn px-5 text-sm font-semibold"
                  >
                    Ouverture suivante
                  </Link>
                ) : null}
                <Link
                  to="/"
                  className="flex h-11 items-center rounded-btn border border-line-strong bg-surface-high px-5 text-sm font-semibold text-ink transition hover:bg-field"
                >
                  Retour
                </Link>
              </div>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-card border border-line bg-surface p-5.5 shadow-card">
            <div className="text-[21px] font-extrabold tracking-[-0.01em]">
              {opening.name}
            </div>
            <div className="mt-1 text-sm text-meta">
              {opening.color === 'white' ? 'Trait aux blancs' : 'Trait aux noirs'}
            </div>
            {activeChapterName && (
              <div className="mt-4 border-t border-line pt-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                  Chapitre
                </div>
                <span
                  className="inline-flex max-w-full items-center gap-1.75 rounded-full border border-accent-soft-border bg-accent-soft px-2.75 py-1.25 text-[12.5px] font-semibold text-accent-soft-text"
                  title={activeChapterName}
                >
                  <span className="h-1.75 w-1.75 shrink-0 rounded-full bg-accent-dot" />
                  <span className="truncate">{activeChapterName}</span>
                </span>
              </div>
            )}
          </div>

          <div className="rounded-card border border-line bg-surface px-5 py-4.5 shadow-card">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
              Cette session
            </div>
            <div className="flex gap-5.5">
              <Stat value={stats.pass} label="bonnes" tone="text-success" />
              <Stat value={stats.fail} label="erreurs" tone="text-danger" />
              <Stat value={stats.revealed} label="révélés" tone="text-warning-text" />
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                Restantes
              </div>
              <div className="space-y-2 text-sm">
                <RemainingRow label="Ce chapitre" value={remaining} tone="text-accent" />
                {openingsFile ? (
                  <>
                    <RemainingRow label="Cette ouverture" value={openingDue} tone="text-ink" />
                    <RemainingRow label="Cette session" value={programDue ?? 0} tone="text-ink-soft" />
                  </>
                ) : (
                  <RemainingRow label="Cette session" value={openingDue} tone="text-ink" />
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function OpeningsFile({
  items,
  activeId,
}: {
  items: OpeningFileItem[];
  activeId: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
      <span className="shrink-0 pr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        À réviser
      </span>
      {items.map(o => {
        const active = o.id === activeId;
        return (
          <Link
            key={o.id}
            to="/openings/$openingId/study"
            params={{ openingId: o.id }}
            search={{ program: true }}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
              active
                ? 'border-accent bg-accent-soft text-accent-soft-text'
                : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-high'
            }`}
          >
            {o.name}
            {o.due > 0 && (
              <span
                className={`rounded-full px-1.5 text-[11px] font-bold tnum ${
                  active ? 'bg-accent text-accent-on' : 'bg-track text-ink-soft'
                }`}
              >
                {o.due}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function ChapterRail({
  chapters,
  dueByChapter,
  activeId,
  onSelect,
}: {
  chapters: Chapter[];
  dueByChapter: Map<string, Card[]>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex flex-col gap-1.5">
      <h2 className="mx-1 mb-3.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-ink-muted">
        Chapitres
      </h2>
      {chapters.map(c => {
        const active = c.id === activeId;
        const due = dueByChapter.get(c.id)?.length ?? 0;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            title={c.name}
            className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition ${
              active
                ? 'border-line bg-surface text-ink shadow-resting'
                : 'border-transparent text-ink-soft hover:bg-track hover:text-ink'
            }`}
          >
            <span
              className={`h-4.5 w-0.75 shrink-0 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`}
            />
            <span className="flex-1 truncate">{c.name}</span>
            {due > 0 && (
              <span className="shrink-0 rounded-full border border-accent-soft-border bg-accent-soft px-2 py-px text-[11px] font-bold text-accent-soft-text tnum">
                {due}
              </span>
            )}
          </button>
        );
      })}
    </aside>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-[26px] font-extrabold leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-[12.5px] text-meta">{label}</div>
    </div>
  );
}

function RemainingRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className={`font-bold tnum ${tone}`}>{value}</span>
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

/**
 * End screen of a `?pos=` exercise session. The drilled move usually got
 * missed in a real game because it fell out of the regular rotation
 * (windowed out, or scheduled far away after past successes) — offer to
 * fold it back in: cards rescheduled as new (due now, Anki-style relearn)
 * and the chapter's review windows widened to include the ply.
 */
function ExerciseDone({ opening, cards }: { opening: Opening; cards: Card[] }) {
  const [reintegrated, setReintegrated] = useState(false);

  const reintegrate = () => {
    // Widen windows against the freshest opening from storage (race-safe).
    const latest = openingsRepo.get(opening.id);
    if (latest) {
      let next = latest;
      for (const c of cards) next = coverCardInReviewRanges(next, c);
      if (next !== latest) {
        openingsRepo.save({ ...next, updatedAt: Date.now() });
      }
    }
    const now = Date.now();
    const stored = cardsRepo.list();
    for (const c of cards) {
      const cur = stored.find(s => s.id === c.id) ?? c;
      // Rescheduled as new; the lapse history stays.
      cardsRepo.upsert({ ...cur, ...newCardStats(now), lapses: cur.lapses });
    }
    setReintegrated(true);
  };

  return (
    <div className="flex w-full max-w-140 flex-col items-center rounded-[14px] border border-line bg-surface px-6 py-14 text-center shadow-card">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-2xl text-success">
        ✓
      </span>
      <p className="mt-4 text-lg font-bold">Exercice terminé</p>
      {reintegrated ? (
        <p className="mt-1 max-w-sm text-sm text-meta">
          Réintégré : la position est due dès maintenant et reprendra la
          progression habituelle des révisions.
        </p>
      ) : (
        <p className="mt-1 max-w-sm text-sm text-meta">
          Réintégrer ce coup dans la révision fréquente ? La carte repart
          comme nouvelle (due dès maintenant) et la fenêtre de révision du
          chapitre s'élargit pour l'inclure.
        </p>
      )}
      <div className="mt-6 flex justify-center gap-2.5">
        {!reintegrated && (
          <button
            onClick={reintegrate}
            className="btn-accent flex h-11 items-center rounded-btn px-5 text-sm font-semibold"
          >
            Oui, réintégrer
          </button>
        )}
        <Link
          to="/openings/$openingId"
          params={{ openingId: opening.id }}
          className="flex h-11 items-center rounded-btn border border-line-strong bg-surface-high px-5 text-sm font-semibold text-ink transition hover:bg-field"
        >
          {reintegrated ? "Retour à l'ouverture" : 'Non merci'}
        </Link>
      </div>
    </div>
  );
}
