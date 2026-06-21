import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { Chess } from 'chessops/chess';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
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
import { NAG_COLORS, NAG_LABELS, NAG_SYMBOLS } from '../domain/nag';
import { newCardStats, review, type Grade } from '../domain/srs';
import { buildPrefixTrie, type TrieNode } from '../domain/tree';
import type { Card, CardStats, Opening } from '../domain/types';
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

function cardIdFor(
  openingId: string,
  chapterId: string,
  fen: string,
  expectedUci: string,
): string {
  // Chapter is part of the key so two chapters that diverge on one of the
  // user's own moves stay as separate SRS entries — required to learn
  // alternative repertoire choices without contradictions during review.
  return `${openingId}::${chapterId}::${positionKey(fen)}::${expectedUci}`;
}

/**
 * Build the card set for an opening — one card per
 * `(chapter, position, expected user move)`. Cards walk the prefix trie of
 * each chapter's lines independently, so the same position appearing in two
 * chapters with different expected user moves produces two distinct cards.
 */
function buildCards(opening: Opening, stored: Card[]): Card[] {
  const fallbackChapterId = opening.chapters[0]?.id;
  if (!fallbackChapterId) return [];

  // Re-key every stored card to the current `${opening}::${chapter}::${posKey}::${uci}`
  // shape: legacy `lineId/plyIdx` cards locate their chapter via the line they
  // came from; pre-chapter current-shape cards land in the migrated default
  // chapter (which the openings repo guarantees exists before this runs).
  const byId = new Map<string, Card>();
  for (const raw of stored as unknown[]) {
    if (isLegacyCardShape(raw)) {
      const migrated = migrateLegacyCard(raw, opening);
      if (!migrated) continue;
      const existing = byId.get(migrated.id);
      if (!existing || migrated.reps > existing.reps) byId.set(migrated.id, migrated);
    } else if (isCurrentCardShape(raw)) {
      const chapterId =
        typeof raw.chapterId === 'string' && raw.chapterId.length > 0
          ? raw.chapterId
          : fallbackChapterId;
      const newId = cardIdFor(raw.openingId, chapterId, raw.fen, raw.expectedUci);
      const updated: Card =
        newId !== raw.id || raw.chapterId !== chapterId
          ? { ...raw, id: newId, chapterId }
          : raw;
      const existing = byId.get(newId);
      if (!existing || updated.reps > existing.reps) byId.set(newId, updated);
    }
  }

  const out: Card[] = [];

  for (const chapter of opening.chapters) {
    const chapterLines = opening.lines.filter(l => l.chapterId === chapter.id);
    if (chapterLines.length === 0) continue;
    const trie = buildPrefixTrie(chapterLines);
    const seen = new Set<string>();
    const startFen = chapter.startFen ?? START_FEN;
    const startChess = chessFromFen(startFen);
    // The user-turn parity depends on whose move it is at the chapter's
    // starting position — a chapter that starts with black to move flips
    // every depth-vs-side relationship.
    const userTurnParity =
      turnColor(startChess) === opening.color ? 0 : 1;

    const walk = (node: TrieNode, depth: number, chess: Chess) => {
      if (depth % 2 === userTurnParity) {
        const fen = fenOf(chess);
        for (const uci of node.children.keys()) {
          const id = cardIdFor(opening.id, chapter.id, fen, uci);
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(
            byId.get(id) ?? {
              ...newCardStats(),
              id,
              openingId: opening.id,
              chapterId: chapter.id,
              fen,
              expectedUci: uci,
            },
          );
        }
      }
      for (const [uci, child] of node.children) {
        walk(child, depth + 1, applyUci(chess, uci));
      }
    };

    walk(trie, 0, startChess);
  }

  return out;
}

type LegacyCardShape = CardStats & {
  id: string;
  openingId: string;
  lineId: string;
  plyIdx: number;
};

function isLegacyCardShape(c: unknown): c is LegacyCardShape {
  return typeof c === 'object' && c !== null && 'lineId' in c && 'plyIdx' in c;
}

type CurrentCardLike = Card & { chapterId?: string };

function isCurrentCardShape(c: unknown): c is CurrentCardLike {
  return typeof c === 'object' && c !== null && 'fen' in c && 'expectedUci' in c;
}

function migrateLegacyCard(c: LegacyCardShape, opening: Opening): Card | undefined {
  const line = opening.lines.find(l => l.id === c.lineId);
  if (!line || c.plyIdx >= line.moves.length) return undefined;
  const chapter = opening.chapters.find(ch => ch.id === line.chapterId);
  let chess = chessFromFen(chapter?.startFen ?? START_FEN);
  for (let i = 0; i < c.plyIdx; i++) chess = applyUci(chess, line.moves[i]);
  const fen = fenOf(chess);
  const expectedUci = line.moves[c.plyIdx];
  return {
    ease: c.ease,
    interval: c.interval,
    reps: c.reps,
    due: c.due,
    lapses: c.lapses,
    id: cardIdFor(opening.id, line.chapterId, fen, expectedUci),
    openingId: c.openingId,
    chapterId: line.chapterId,
    fen,
    expectedUci,
  };
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
  const displayLastMove = showAnswer ? expectedUci : undefined;

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
          <div className="relative">
            <Chessboard config={config} />
            {showAnswer && annotation?.nag !== undefined && expectedUci && (
              <NagSquareBadge
                nag={annotation.nag}
                square={expectedUci.slice(2, 4)}
                orientation={opening.color}
              />
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-300">
            {opening.name}
          </h2>
          {currentChapterName && (
            <p className="mt-1 truncate text-xs text-zinc-300" title={currentChapterName}>
              {currentChapterName}
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-500">
            {opening.color === 'white' ? 'Trait aux blancs' : 'Trait aux noirs'}
          </p>

          <div className="mt-5">
            {phase === 'awaiting' && (
              <p className="text-sm text-zinc-400">Jouez le coup attendu.</p>
            )}
            {phase === 'correct' && (
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-emerald-300">Correct.</p>
                  {annotation?.nag !== undefined && (
                    <span
                      className={`font-mono text-sm leading-none ${NAG_COLORS[annotation.nag]}`}
                      title={NAG_LABELS[annotation.nag]}
                    >
                      {NAG_SYMBOLS[annotation.nag]}
                    </span>
                  )}
                </div>
                {annotation?.comment?.trim() && (
                  <p className="mt-2 border-l-2 border-zinc-700 pl-3 text-sm italic text-zinc-300">
                    {annotation.comment}
                  </p>
                )}
                <p className="mt-3 text-xs text-zinc-500">Évaluez votre rappel.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <GradeButton onClick={() => grade(3)} label="Difficile" tone="amber" />
                  <GradeButton onClick={() => grade(4)} label="Bien" tone="emerald" />
                  <GradeButton onClick={() => grade(5)} label="Facile" tone="sky" />
                </div>
              </div>
            )}
            {phase === 'wrong' && (
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-red-300">Erreur.</p>
                  {annotation?.nag !== undefined && (
                    <span
                      className={`font-mono text-sm leading-none ${NAG_COLORS[annotation.nag]}`}
                      title={NAG_LABELS[annotation.nag]}
                    >
                      {NAG_SYMBOLS[annotation.nag]}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Coup attendu :{' '}
                  <span className="font-mono text-zinc-200">
                    {expectedUci ? uciToSanAt(fenOf(chess), expectedUci) : '—'}
                  </span>
                </p>
                {annotation?.comment?.trim() && (
                  <p className="mt-2 border-l-2 border-zinc-700 pl-3 text-sm italic text-zinc-300">
                    {annotation.comment}
                  </p>
                )}
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
