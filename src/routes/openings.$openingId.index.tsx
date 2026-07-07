import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Config } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
import { FigurineSan } from '../components/FigurineSan';
import { Modal } from '../components/Modal';
import { NagSquareBadge } from '../components/NagSquareBadge';
import { BoardNav } from '../components/opening/BoardNav';
import { ChapterNameModal } from '../components/opening/ChapterNameModal';
import { OpeningNotFound } from '../components/opening/OpeningNotFound';
import { RecognitionBar } from '../components/opening/RecognitionBar';
import { SelectedLineView } from '../components/opening/SelectedLineView';
import { useLineNavigation } from '../components/opening/useLineNavigation';
import {
  buildAdherenceReport,
  leakReviewedSince,
  refineAdherence,
  type RefinedAdherence,
  type RefinedLeak,
} from '../domain/adherence';
import {
  chessFromFen,
  lineToSan,
  moveNumberLabel,
  START_FEN,
  turnColor,
} from '../domain/chess';
import { getAccount, subscribeAccount } from '../domain/lichessAuth';
import { fetchRecentGamesCached, type RecentGame } from '../domain/lichessGames';
import { NAG_COLORS, NAG_LABELS, NAG_SYMBOLS } from '../domain/nag';
import { exportToPgn } from '../domain/pgn';
import { segmentLines } from '../domain/tree';
import type { Annotation, Chapter, Line, Opening } from '../domain/types';
import { cardsRepo, openingsRepo, reviewsRepo } from '../storage/repository';
import { useStored } from '../storage/store';

export const Route = createFileRoute('/openings/$openingId/')({
  component: OverviewOpening,
});

function OverviewOpening() {
  const { openingId } = Route.useParams();
  const opening = useStored(() => openingsRepo.get(openingId));
  if (!opening) return <OpeningNotFound />;
  return <OverviewInner key={opening.id} opening={opening} />;
}

/**
 * The opening's home page: read-only board and scoresheet for browsing the
 * repertoire, plus everything opening-level — chapter management, review
 * windows, Lichess fidelity, PGN export, deletion. Playing moves happens on
 * the edit page only.
 */
function OverviewInner({ opening }: { opening: Opening }) {
  const navigate = useNavigate();
  const {
    line,
    cursorIdx,
    setCursorIdx,
    selectLine,
    switchToChapter,
    currentChapterId,
    chapterStartFen,
    sortedChapters,
    currentFen,
    trie,
    rootLine,
    sansOfSelected,
    fenAtPosition,
    currentAnnotation,
    nagsAlongLine,
  } = useLineNavigation(opening);

  /** See the editor's twin: mutations always run against the freshest
   * opening from storage so concurrent writers can't clobber each other. */
  const updateOpening = (mutator: (latest: Opening) => Opening) => {
    const latest = openingsRepo.get(opening.id);
    if (!latest) return;
    openingsRepo.save({ ...mutator(latest), updatedAt: Date.now() });
  };

  // --- Chapter management ----------------------------------------------------
  const [renamingChapterId, setRenamingChapterId] = useState<string | undefined>();
  const [chapterRenameDraft, setChapterRenameDraft] = useState('');
  const [chapterModalOpen, setChapterModalOpen] = useState(false);

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
    // The selected-line fallback in useLineNavigation picks the first
    // remaining line on the next render if we just deleted the current
    // chapter.
  };

  /** Manual "+ Nouveau chapitre": an empty chapter always starts from the
   * standard initial position so the user gets a fresh board ready for
   * their colour to move; inheriting a black-to-move custom FEN would lock
   * the board when the user expects to start fresh. */
  const confirmNewChapter = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const latest = openingsRepo.get(opening.id);
    if (!latest) {
      setChapterModalOpen(false);
      return;
    }
    const chapter: Chapter = {
      id: crypto.randomUUID(),
      name: trimmed,
      order: latest.chapters.length,
    };
    const root: Line = {
      id: crypto.randomUUID(),
      name: 'Ligne principale',
      chapterId: chapter.id,
      parentLineId: undefined,
      moves: [],
    };
    openingsRepo.save({
      ...latest,
      chapters: [...latest.chapters, chapter],
      lines: [...latest.lines, root],
      updatedAt: Date.now(),
    });
    selectLine(root.id, 0);
    setChapterModalOpen(false);
  };

  const removeOpening = () => {
    if (!confirm('Supprimer cette ouverture ?')) return;
    openingsRepo.delete(opening.id);
    navigate({ to: '/' });
  };

  const [exportOpen, setExportOpen] = useState(false);

  // Read-only board: viewOnly short-circuits chessground's event binding
  // entirely (no drag, no drawing), while saved arrows still render through
  // autoShapes — same pattern as the BifurcationPanel mini-board.
  const config: Config = useMemo(() => {
    const lastMoveUci = cursorIdx > 0 && line ? line.moves[cursorIdx - 1] : undefined;
    const storedArrows: DrawShape[] =
      currentAnnotation?.arrows?.map(a => ({
        orig: a.orig as Key,
        dest: a.dest as Key | undefined,
        brush: a.brush,
      })) ?? [];
    return {
      fen: currentFen,
      orientation: opening.color,
      lastMove: lastMoveUci
        ? [lastMoveUci.slice(0, 2) as Key, lastMoveUci.slice(2, 4) as Key]
        : undefined,
      viewOnly: true,
      animation: { enabled: true, duration: 200 },
      drawable: { enabled: false, visible: true, autoShapes: storedArrows },
    };
  }, [currentFen, opening.color, line, cursorIdx, currentAnnotation]);

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
          onClick={() => setChapterModalOpen(true)}
          className="mt-1 w-full rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-[13.5px] font-semibold text-meta transition hover:border-accent hover:text-accent"
        >
          + Nouveau chapitre
        </button>
        <div className="mt-2">
          <AdherenceCard opening={opening} />
        </div>
      </aside>
      {/* Same alignment as the editor: content constrained to the board
          width, end-aligned — spare column space goes to the left gap. */}
      <section className="w-132 max-w-full justify-self-end space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          </div>
          <div className="flex gap-2.5">
            <Link
              to="/openings/$openingId/edit"
              params={{ openingId: opening.id }}
              search={line ? { line: line.id, ply: cursorIdx } : {}}
              className="flex h-10 items-center rounded-[10px] border border-line-strong bg-surface px-3.75 text-[13.5px] font-semibold text-ink transition hover:bg-surface-high"
            >
              Éditer
            </Link>
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
        <RecognitionBar
          moves={line?.moves}
          cursorIdx={cursorIdx}
          startFen={chapterStartFen}
          color={opening.color}
        />
        <div className="space-y-3">
          <div className="relative">
            <Chessboard
              config={config}
              className="aspect-square w-full overflow-hidden rounded-xl shadow-resting ring-1 ring-line-strong saturate-[0.93]"
            />
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
          <BoardNav
            cursorIdx={cursorIdx}
            total={line?.moves.length ?? 0}
            onChange={setCursorIdx}
          />
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
                onSwitchLine={selectLine}
              />
            ) : (
              <p className="pb-3 text-sm italic text-meta">
                Ouverture vide. Passe en édition pour jouer des coups.
              </p>
            )}
          </div>
        </div>

        <AnnotationReadonly annotation={currentAnnotation} />
      </aside>

      {chapterModalOpen && (
        <ChapterNameModal
          forced={false}
          defaultName=""
          onConfirm={confirmNewChapter}
          onCancel={() => setChapterModalOpen(false)}
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

/** Read-only mirror of the editor's annotation panel: shows the judgement
 * and comment stored at the current position, nothing when there is none
 * (saved arrows already render on the board). */
function AnnotationReadonly({ annotation }: { annotation: Annotation | undefined }) {
  const nag = annotation?.nag;
  const comment = annotation?.comment?.trim();
  if (nag === undefined && !comment) return null;
  return (
    <div className="rounded-[14px] border border-line bg-surface p-4 shadow-resting">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        Annotation
      </div>
      {nag !== undefined && (
        <div className={`mb-2 flex items-baseline gap-2 ${comment ? '' : 'mb-0'}`}>
          <span className={`text-[15px] font-bold leading-none ${NAG_COLORS[nag]}`}>
            {NAG_SYMBOLS[nag]}
          </span>
          <span className="text-[12.5px] text-ink-soft">{NAG_LABELS[nag]}</span>
        </div>
      )}
      {comment && (
        <p className="whitespace-pre-wrap text-sm text-ink">{comment}</p>
      )}
    </div>
  );
}

/**
 * Compact fidelity card for the overview's narrow left column — condensed
 * from the former full-width AdherencePanel. Same behavior-based data
 * pipeline: games are attributed to the opening they followed deepest, and
 * each miss is read against the user's own baseline at that position.
 * Silent unless connected and at least one game is attributed here.
 */
function AdherenceCard({ opening }: { opening: Opening }) {
  const account = useSyncExternalStore(subscribeAccount, getAccount, getAccount);
  const allOpenings = useStored(() => openingsRepo.list());
  const cards = useStored(() => cardsRepo.list());
  const reviews = useStored(() => reviewsRepo.list());
  const navigate = useNavigate();
  const [games, setGames] = useState<RecentGame[] | null>(null);

  useEffect(() => {
    if (!account) {
      setGames(null);
      return;
    }
    let cancelled = false;
    fetchRecentGamesCached(account.username, account.token, 200)
      .then(gs => {
        if (!cancelled) setGames(gs);
      })
      .catch(() => {
        /* card is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  const report = useMemo(
    () => (games ? buildAdherenceReport(games, allOpenings, opening.id) : null),
    [games, allOpenings, opening.id],
  );

  // Leak classification is async (lazy ECO index): lapse vs disagreement vs
  // deliberate alternative opening — the latter leaves the fidelity math.
  const [refined, setRefined] = useState<RefinedAdherence | null>(null);
  useEffect(() => {
    if (!report) {
      setRefined(null);
      return;
    }
    let cancelled = false;
    refineAdherence(report).then(r => {
      if (!cancelled) setRefined(r);
    });
    return () => {
      cancelled = true;
    };
  }, [report]);

  const [expanded, setExpanded] = useState(false);

  if (!refined) return null;

  const pct =
    refined.countedDecisions > 0
      ? Math.round((refined.followed / refined.countedDecisions) * 100)
      : 100;
  const tone =
    pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning-text' : 'text-danger';
  const shown = expanded ? refined.leaks : refined.leaks.slice(0, 2);
  const hidden = refined.leaks.length - shown.length;

  /** Full explanation, surfaced as a tooltip — the row itself stays one line. */
  const leakTitle = (leak: RefinedLeak): string => {
    const head = `${moveNumberLabel(leak.ply)} ${leak.expectedSans.join(' / ')}`;
    if (leak.kind === 'alternative') {
      return `${head} — tu joues aussi ${leak.openingName} ici (${leak.missSan} ×${leak.missTopCount}) : autre ouverture, hors calcul`;
    }
    if (leak.kind === 'disagreement') {
      return `${head} — tu joues ${leak.missSan} systématiquement (${leak.missCount}×) : révise, ou adapte le répertoire`;
    }
    return `${head} — joué ${leak.missSan} ${leak.missCount}× sur ${leak.seen} passage${
      leak.seen > 1 ? 's' : ''
    }${leak.followed > 0 ? ' (trou de mémoire)' : ''}`;
  };

  return (
    <div className="rounded-[14px] border border-line bg-surface p-3.5 shadow-resting">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        Fidélité · Lichess
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={`text-[26px] font-extrabold leading-none tnum ${tone}`}>
          {pct}%
        </span>
        <span className="text-[11.5px] text-meta tnum">
          {refined.followed}/{refined.countedDecisions} suivis
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-meta tnum">
        {refined.games} partie{refined.games > 1 ? 's' : ''}
        {refined.alternativeMisses > 0 &&
          ` · ${refined.alternativeMisses} coups exclus (autre ouverture)`}
      </p>
      {refined.leaks.length === 0 ? (
        <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] text-success">
          Aucun coup manqué — la théorie tient.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
          {shown.map(leak => (
            <li
              key={leak.key}
              className="flex items-center justify-between gap-2"
              title={leakTitle(leak)}
            >
              <span className="min-w-0 truncate text-[12.5px] text-ink-soft">
                <span className="font-semibold text-ink tnum">
                  {moveNumberLabel(leak.ply)}
                </span>{' '}
                <span className="font-semibold text-ink">
                  <FigurineSan san={leak.expectedSans[0] ?? ''} />
                </span>{' '}
                <span className="text-ink-muted">
                  ×{leak.missCount}
                </span>
              </span>
              {leak.kind === 'alternative' ? (
                <button
                  onClick={() => navigate({ to: '/lichess' })}
                  title="Voir tes ouvertures jouées — et créer son répertoire si tu veux la driller"
                  className="shrink-0 rounded-full border border-line-strong bg-surface-high px-2 py-0.5 text-[11px] font-semibold text-ink transition hover:bg-field"
                >
                  → Lichess
                </button>
              ) : leakReviewedSince(leak, cards, reviews) ? (
                <span
                  title="Bon coup joué en révision depuis le dernier raté en partie — se rouvrira si une nouvelle partie le rate encore"
                  className="shrink-0 rounded-full border border-line bg-field px-2 py-0.5 text-[11px] font-semibold text-success"
                >
                  Révisé ✓
                </span>
              ) : (
                <button
                  onClick={() =>
                    navigate({
                      to: '/openings/$openingId/study',
                      params: { openingId: opening.id },
                      search: { program: false, pos: leak.key },
                    })
                  }
                  className="shrink-0 rounded-full border border-accent-soft-border bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-soft-text transition hover:brightness-[0.97]"
                >
                  Réviser
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(hidden > 0 || expanded) && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 text-[11.5px] font-semibold text-ink-muted transition hover:text-ink"
        >
          {expanded ? 'Réduire' : `+${hidden} autre${hidden > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
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
