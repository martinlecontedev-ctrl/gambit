import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Modal } from '../components/Modal';
import { ReviewSwitch } from '../components/ReviewSwitch';
import {
  fetchLichessStudy,
  importFromPgn,
  importLichessStudy,
  type ImportResult,
} from '../domain/pgn';
import {
  activityByDay,
  localDate,
  reviewsToday,
  streaks,
} from '../domain/activity';
import {
  openingReviewOn,
  openingStats,
  withOpeningReview,
  type OpeningStats,
} from '../domain/cards';
import type { Card, Color, Folder, Opening, ReviewEvent } from '../domain/types';
import { LOCALES, useLang } from '../i18n';
import { useHomeStrings } from '../i18n/home';
import {
  cardsRepo,
  foldersRepo,
  openingsRepo,
  reviewsRepo,
} from '../storage/repository';
import { useStored } from '../storage/store';

export const Route = createFileRoute('/')({ component: Home });

/** `'none'` = openings at the root level. Any other string = a folder id. */
type FolderFilter = 'none' | string;

function Home() {
  const tr = useHomeStrings();
  const openings = useStored(() => openingsRepo.list());
  const cards = useStored(() => cardsRepo.list());
  const folders = useStored(() => foldersRepo.list());
  const reviews = useStored(() => reviewsRepo.list());
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<FolderFilter>('none');
  const [draggedOpeningId, setDraggedOpeningId] = useState<string | undefined>();
  const [hoverTarget, setHoverTarget] = useState<FolderFilter | undefined>();

  // If the user just deleted the folder they were viewing, fall back to the
  // root view so the empty pane doesn't dangle on a stale id.
  useEffect(() => {
    if (selectedFolder !== 'none' && !folders.find(f => f.id === selectedFolder)) {
      setSelectedFolder('none');
    }
  }, [folders, selectedFolder]);

  // Freeze "now" for the mount so per-opening stats don't recompute on every
  // re-render (drag hover state churns Home constantly); buildCards walks each
  // chapter's trie and is not free.
  const now = useMemo(() => Date.now(), []);

  const cardsByOpening = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of cards) {
      const arr = m.get(c.openingId);
      if (arr) arr.push(c);
      else m.set(c.openingId, [c]);
    }
    return m;
  }, [cards]);

  const statsByOpening = useMemo(() => {
    const m = new Map<string, OpeningStats>();
    for (const o of openings) {
      m.set(o.id, openingStats(o, cardsByOpening.get(o.id) ?? [], now));
    }
    return m;
  }, [openings, cardsByOpening, now]);

  const totalDue = useMemo(() => {
    let s = 0;
    for (const st of statsByOpening.values()) s += st.due;
    return s;
  }, [statsByOpening]);

  const dueOpenings = useMemo(
    () => openings.filter(o => (statsByOpening.get(o.id)?.due ?? 0) > 0),
    [openings, statsByOpening],
  );

  // Distinct moves successfully reviewed today, counted from the review log.
  // The banner's day total is then `done + totalDue`, so it resets naturally
  // each calendar day with no snapshot to maintain.
  const done = useMemo(() => reviewsToday(reviews, now), [reviews, now]);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  );

  const dueByFolder = useMemo(() => {
    const byId = new Map<string, number>();
    let none = 0;
    for (const o of openings) {
      const d = statsByOpening.get(o.id)?.due ?? 0;
      if (d === 0) continue;
      if (!o.folderId) none += d;
      else byId.set(o.folderId, (byId.get(o.folderId) ?? 0) + d);
    }
    return { byId, none };
  }, [openings, statsByOpening]);

  const countByFolder = useMemo(() => {
    const m = new Map<string, number>();
    let noneCount = 0;
    for (const o of openings) {
      if (!o.folderId) noneCount++;
      else m.set(o.folderId, (m.get(o.folderId) ?? 0) + 1);
    }
    return { byId: m, none: noneCount };
  }, [openings]);

  const visibleOpenings = useMemo(() => {
    if (selectedFolder === 'none') return openings.filter(o => !o.folderId);
    return openings.filter(o => o.folderId === selectedFolder);
  }, [openings, selectedFolder]);

  const moveOpening = (openingId: string, target: FolderFilter) => {
    const opening = openingsRepo.get(openingId);
    if (!opening) return;
    const nextFolderId = target === 'none' ? undefined : target;
    if (opening.folderId === nextFolderId) return;
    openingsRepo.save({ ...opening, folderId: nextFolderId, updatedAt: Date.now() });
  };

  return (
    <main className="mx-auto max-w-310 px-4 pt-8 pb-20 sm:px-6 lg:px-10 lg:pt-10">
      <div className="mb-6.5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[42px] font-extrabold leading-none tracking-[-0.02em] text-on-ink">
            {tr.title}
          </h1>
          <p className="mt-2 text-[15px] text-on-muted">
            {openings.length === 0
              ? tr.emptySubtitle
              : tr.counts(openings.length, folders.length)}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setImportOpen(true)}
            className="h-11 rounded-btn border border-chip-border bg-chip px-4.5 text-[14.5px] font-semibold text-chip-text shadow-resting transition hover:border-chip-hover"
          >
            {tr.importBtn}
          </button>
          <Link
            to="/openings/new"
            className="btn-accent flex h-11 items-center rounded-btn px-5 text-[14.5px] font-semibold"
          >
            {tr.newOpeningBtn}
          </Link>
        </div>
      </div>

      {openings.length > 0 && (
        <div className="mb-7.5 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
          <ReviewBanner totalDue={totalDue} done={done} dueOpenings={dueOpenings} />
          <ActivityCard reviews={reviews} now={now} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[248px_1fr] lg:items-start lg:gap-10">
        <FolderSidebar
          folders={sortedFolders}
          selected={selectedFolder}
          onSelect={setSelectedFolder}
          countsByFolder={countByFolder.byId}
          noneCount={countByFolder.none}
          dueByFolder={dueByFolder.byId}
          noneDue={dueByFolder.none}
          draggedOpeningId={draggedOpeningId}
          hoverTarget={hoverTarget}
          onHover={setHoverTarget}
          onDrop={target => {
            if (draggedOpeningId) moveOpening(draggedOpeningId, target);
            setDraggedOpeningId(undefined);
            setHoverTarget(undefined);
          }}
        />

        {visibleOpenings.length === 0 ? (
          <EmptyState selected={selectedFolder} />
        ) : (
          <ul className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {visibleOpenings.map(o => (
              <OpeningCard
                key={o.id}
                opening={o}
                stats={statsByOpening.get(o.id) ?? { total: 0, mastered: 0, due: 0 }}
                isDragged={draggedOpeningId === o.id}
                onDragStart={() => setDraggedOpeningId(o.id)}
                onDragEnd={() => {
                  setDraggedOpeningId(undefined);
                  setHoverTarget(undefined);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </main>
  );
}

function ReviewBanner({
  totalDue,
  done,
  dueOpenings,
}: {
  totalDue: number;
  done: number;
  dueOpenings: Opening[];
}) {
  const tr = useHomeStrings();
  const displayTotal = done + totalDue;
  const pct = displayTotal > 0 ? Math.round((done / displayTotal) * 100) : 0;

  if (totalDue === 0) {
    return (
      <div className="flex h-full items-center gap-4 rounded-[18px] border border-line bg-surface px-5 py-5 text-ink shadow-card sm:px-6 sm:py-5.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success-soft text-2xl text-success-text">
          ✓
        </span>
        <div>
          <p className="text-lg font-bold">{tr.banner.allDone}</p>
          <p className="text-sm text-meta">
            {done > 0 ? tr.banner.reviewedToday(done) : tr.banner.nothingToday}
          </p>
        </div>
      </div>
    );
  }

  const names = dueOpenings.map(o => o.name);
  const namesLabel =
    names.length <= 3
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;

  return (
    <div className="flex h-full flex-col justify-between gap-3 rounded-[18px] border border-line bg-surface px-5 py-3.5 text-ink shadow-card sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="text-[44px] font-extrabold leading-[0.9] tracking-[-0.03em] text-accent tnum">
            {totalDue}
          </span>
          <div>
            <p className="text-lg font-bold leading-tight">
              {tr.banner.dueToday(totalDue)}
            </p>
            <p className="mt-1 text-sm text-meta">
              {tr.banner.spread(totalDue, dueOpenings.length)}
              {namesLabel && ` · ${namesLabel}`}
            </p>
          </div>
        </div>
        <Link
          to="/openings/$openingId/study"
          params={{ openingId: dueOpenings[0].id }}
          search={{ program: true }}
          className="btn-accent flex h-10 items-center rounded-btn px-5 text-[14px] font-semibold"
        >
          {tr.banner.start}
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.75 flex-1 overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[12.5px] text-ink-muted tnum">
          {tr.banner.progress(done, totalDue)}
        </span>
      </div>
    </div>
  );
}

/** One heat cell per day; `null` marks the future days of the current week so
 * the last grid column keeps its 7-row shape. */
type WeekDay = { key: string; date: Date; count: number };

/** The last 7 days ending today, oldest first. Date arithmetic goes through
 * `setDate` so DST transitions can't skip or double a day. */
function buildWeekDays(byDay: Map<string, number>, now: number): WeekDay[] {
  const days: WeekDay[] = [];
  for (let back = 6; back >= 0; back--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - back);
    const key = localDate(d.getTime());
    days.push({ key, date: d, count: byDay.get(key) ?? 0 });
  }
  return days;
}

/** Round the week's peak up to a clean, even axis maximum so the midpoint
 * gridline always lands on a whole number. */
function niceAxisMax(peak: number): number {
  const steps = [2, 4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100];
  for (const s of steps) if (peak <= s) return s;
  return Math.ceil(peak / 50) * 50;
}

/** Streak card: streak text on the left, a small bar chart of the last 7 days'
 * review counts on the right (review count on the Y axis, days on the X axis).
 * A CSS grid keeps the Y-axis labels, gridlines, bars and day labels aligned. */
function ActivityCard({ reviews, now }: { reviews: ReviewEvent[]; now: number }) {
  const tr = useHomeStrings();
  const lang = useLang();
  const weekdayFmt = useMemo(
    () => new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'narrow' }),
    [lang],
  );
  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(LOCALES[lang], {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      }),
    [lang],
  );
  const byDay = useMemo(() => activityByDay(reviews), [reviews]);
  const streak = useMemo(() => streaks(reviews, now), [reviews, now]);
  const week = useMemo(() => buildWeekDays(byDay, now), [byDay, now]);
  const axisMax = useMemo(
    () => niceAxisMax(Math.max(1, ...week.map(d => d.count))),
    [week],
  );
  const todayKey = localDate(now);

  return (
    <div className="flex h-full min-h-24 items-stretch gap-5 rounded-[18px] border border-line bg-surface px-5 py-3.5 text-ink shadow-card sm:px-6">
      <div className="flex shrink-0 flex-col justify-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {tr.activity.streakTitle}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`text-[34px] font-extrabold leading-[0.9] tracking-[-0.03em] tnum ${
              streak.current > 0 ? 'text-accent' : 'text-ink-muted'
            }`}
          >
            {streak.current}
          </span>
          <span className="text-sm font-bold leading-tight">
            {tr.activity.daysInARow(streak.current)}
          </span>
        </div>
        <div className="mt-1.5 text-[12px] text-meta">
          {tr.activity.record}{' '}
          <span className="font-bold text-ink-soft tnum">{streak.best}</span>{' '}
          {tr.activity.days(streak.best)}
        </div>
      </div>

      {/* Plot height is capped (grid-rows) and the chart self-centers, so the
          bars stay a readable height instead of filling the whole card. */}
      <div className="grid min-w-0 flex-1 self-center grid-cols-[1.75rem_1fr] grid-rows-[4rem_auto] gap-x-2">
        {/* Y axis: review-count ticks aligned to the gridlines. */}
        <div className="flex flex-col justify-between text-right text-[9px] leading-none text-ink-muted tnum">
          <span>{axisMax}</span>
          <span>{axisMax / 2}</span>
          <span>0</span>
        </div>
        {/* Plot: gridlines behind, one thin bar per day. */}
        <div className="relative flex items-stretch gap-[3px]">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            <span className="border-t border-line/70" />
            <span className="border-t border-line/70" />
            <span className="border-t border-line/70" />
          </div>
          {week.map(d => {
            const isToday = d.key === todayKey;
            return (
              <div key={d.key} className="relative flex flex-1 flex-col justify-end">
                <div
                  title={tr.activity.dayTooltip(d.count, dayFmt.format(d.date))}
                  className="mx-auto w-2 rounded-t-[2px] transition-[filter] hover:brightness-90"
                  style={{
                    height: d.count > 0 ? `${Math.max(2, (d.count / axisMax) * 100)}%` : 0,
                    background: isToday
                      ? 'var(--accent)'
                      : 'color-mix(in srgb, var(--accent) 66%, var(--color-surface))',
                  }}
                />
              </div>
            );
          })}
        </div>
        {/* X axis: weekday initials, aligned under the bars. */}
        <div />
        <div className="mt-1.5 flex gap-[3px]">
          {week.map(d => (
            <span
              key={d.key}
              className={`flex-1 text-center text-[10px] font-medium capitalize ${
                d.key === todayKey ? 'text-accent-soft-text' : 'text-ink-muted'
              }`}
            >
              {weekdayFmt.format(d.date)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FolderSidebar({
  folders,
  selected,
  onSelect,
  countsByFolder,
  noneCount,
  dueByFolder,
  noneDue,
  draggedOpeningId,
  hoverTarget,
  onHover,
  onDrop,
}: {
  folders: Folder[];
  selected: FolderFilter;
  onSelect: (f: FolderFilter) => void;
  countsByFolder: Map<string, number>;
  noneCount: number;
  dueByFolder: Map<string, number>;
  noneDue: number;
  draggedOpeningId: string | undefined;
  hoverTarget: FolderFilter | undefined;
  onHover: (t: FolderFilter | undefined) => void;
  onDrop: (t: FolderFilter) => void;
}) {
  const tr = useHomeStrings();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | undefined>();
  const [renameDraft, setRenameDraft] = useState('');

  const submitCreate = () => {
    const name = newName.trim();
    if (name) {
      foldersRepo.save({
        id: crypto.randomUUID(),
        name,
        createdAt: Date.now(),
      });
    }
    setCreating(false);
    setNewName('');
  };

  const submitRename = (id: string) => {
    const folder = foldersRepo.get(id);
    if (folder && renameDraft.trim()) {
      foldersRepo.save({ ...folder, name: renameDraft.trim() });
    }
    setRenamingId(undefined);
    setRenameDraft('');
  };

  const deleteFolder = (folder: Folder) => {
    const count = countsByFolder.get(folder.id) ?? 0;
    if (confirm(tr.folders.deleteConfirm(folder.name, count))) {
      foldersRepo.delete(folder.id);
    }
  };

  return (
    <aside className="flex flex-col gap-1">
      <h2 className="mx-1 mb-3.5 mt-1.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-on-muted">
        {tr.folders.title}
      </h2>
      <SidebarItem
        label={tr.folders.none}
        count={noneCount}
        due={noneDue}
        active={selected === 'none'}
        droppable
        hovered={hoverTarget === 'none'}
        draggingActive={!!draggedOpeningId}
        onClick={() => onSelect('none')}
        onHoverEnter={() => onHover('none')}
        onHoverLeave={() => onHover(undefined)}
        onDrop={() => onDrop('none')}
      />
      {folders.map(f => (
        <SidebarItem
          key={f.id}
          label={f.name}
          count={countsByFolder.get(f.id) ?? 0}
          due={dueByFolder.get(f.id) ?? 0}
          active={selected === f.id}
          droppable
          hovered={hoverTarget === f.id}
          draggingActive={!!draggedOpeningId}
          onClick={() => onSelect(f.id)}
          onHoverEnter={() => onHover(f.id)}
          onHoverLeave={() => onHover(undefined)}
          onDrop={() => onDrop(f.id)}
          renaming={renamingId === f.id}
          renameDraft={renameDraft}
          onRenameStart={() => {
            setRenamingId(f.id);
            setRenameDraft(f.name);
          }}
          onRenameChange={setRenameDraft}
          onRenameSubmit={() => submitRename(f.id)}
          onRenameCancel={() => {
            setRenamingId(undefined);
            setRenameDraft('');
          }}
          onDelete={() => deleteFolder(f)}
        />
      ))}
      {creating ? (
        <div className="mt-1 px-1">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onBlur={submitCreate}
            onKeyDown={e => {
              if (e.key === 'Enter') submitCreate();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
            placeholder={tr.folders.namePlaceholder}
            className="w-full rounded-input border border-ground-line bg-ground-overlay px-3 py-2 text-sm text-on-ink placeholder:text-on-muted focus:border-accent-ground focus:outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-3.5 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13.5px] font-semibold text-on-muted transition hover:bg-ground-overlay hover:text-on-ink"
        >
          {tr.folders.newFolder}
        </button>
      )}
    </aside>
  );
}

function SidebarItem({
  label,
  count,
  due,
  active,
  droppable,
  hovered,
  draggingActive,
  onClick,
  onHoverEnter,
  onHoverLeave,
  onDrop,
  renaming,
  renameDraft,
  onRenameStart,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
}: {
  label: string;
  count: number;
  due: number;
  active: boolean;
  droppable?: boolean;
  hovered?: boolean;
  draggingActive?: boolean;
  onClick: () => void;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
  onDrop?: () => void;
  renaming?: boolean;
  renameDraft?: string;
  onRenameStart?: () => void;
  onRenameChange?: (v: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
  onDelete?: () => void;
}) {
  const tr = useHomeStrings();
  const dropHandlers = droppable
    ? {
        onDragOver: (e: DragEvent) => {
          if (draggingActive) {
            e.preventDefault();
            onHoverEnter?.();
          }
        },
        onDragLeave: () => onHoverLeave?.(),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          onDrop?.();
        },
      }
    : {};

  return (
    <div
      {...dropHandlers}
      className={`group relative rounded-[10px] border transition ${
        hovered
          ? 'border-accent-ground bg-ground-overlay ring-1 ring-inset ring-accent-ground'
          : active
            ? 'border-ground-line bg-ground-overlay shadow-resting'
            : 'border-transparent hover:bg-ground-overlay'
      }`}
    >
      {renaming ? (
        <input
          autoFocus
          value={renameDraft ?? ''}
          onChange={e => onRenameChange?.(e.target.value)}
          onBlur={() => onRenameSubmit?.()}
          onKeyDown={e => {
            if (e.key === 'Enter') onRenameSubmit?.();
            if (e.key === 'Escape') onRenameCancel?.();
          }}
          className="w-full rounded-[10px] bg-transparent px-3 py-2.5 text-[14.5px] text-on-ink focus:outline-none"
        />
      ) : (
        <button
          onClick={onClick}
          className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-left text-[14.5px] font-medium transition ${
            active ? 'text-on-ink' : 'text-on-body hover:text-on-ink'
          }`}
        >
          <span className="truncate">{label}</span>
          <span className="flex shrink-0 items-center gap-2">
            {due > 0 && (
              <span className="rounded-full border border-accent-soft-border bg-accent-soft px-2 py-px text-[11px] font-bold text-accent-soft-text tnum">
                {due}
              </span>
            )}
            <span className="text-xs text-on-idle tnum">{count}</span>
          </span>
        </button>
      )}
      {!renaming && (onRenameStart || onDelete) && (
        <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-line bg-surface-high px-1 py-0.5 opacity-0 shadow-resting transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
          {onRenameStart && (
            <button
              onClick={e => {
                e.stopPropagation();
                onRenameStart();
              }}
              title={tr.folders.rename}
              className="rounded p-1 text-xs text-ink-soft transition hover:bg-track hover:text-ink"
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              onClick={e => {
                e.stopPropagation();
                onDelete();
              }}
              title={tr.folders.deleteTitle}
              className="rounded p-1 text-xs text-ink-soft transition hover:bg-danger-soft hover:text-danger-text"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OpeningCard({
  opening,
  stats,
  isDragged,
  onDragStart,
  onDragEnd,
}: {
  opening: Opening;
  stats: OpeningStats;
  isDragged: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const tr = useHomeStrings();
  const masteryPct =
    stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
  const reviewOn = openingReviewOn(opening);
  // Read the latest before flipping: two writers on the same opening object
  // from stale closures would clobber each other (see CLAUDE.md bug #3).
  const toggleReview = () => {
    const latest = openingsRepo.get(opening.id);
    if (!latest) return;
    openingsRepo.save({
      ...withOpeningReview(latest, !openingReviewOn(latest)),
      updatedAt: Date.now(),
    });
  };
  return (
    <li
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', opening.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-card border border-line bg-surface p-5 text-ink shadow-card transition hover:border-line-strong active:cursor-grabbing ${
        isDragged ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-bold tracking-[-0.01em]">{opening.name}</h2>
          <p className="mt-1.5 text-[11.5px] font-bold uppercase tracking-widest text-ink-muted">
            {opening.color === 'white' ? tr.white : tr.black} ·{' '}
            {tr.card.lines(opening.lines.length)}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ReviewSwitch on={reviewOn} onToggle={toggleReview} />
          <button
            onClick={() => {
              if (confirm(tr.card.deleteConfirm(opening.name))) {
                openingsRepo.delete(opening.id);
              }
            }}
            title={tr.card.deleteTitle}
            aria-label={tr.card.deleteTitle}
            className="rounded p-1 text-lg leading-none text-ink-muted transition hover:bg-danger-soft hover:text-danger-text"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            {tr.card.mastery}
          </span>
          <span className="text-[12.5px] font-bold text-accent-soft-text tnum">
            {reviewOn ? `${masteryPct}%` : '—'}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${masteryPct}%` }}
          />
        </div>
      </div>

      <div className="mt-3.5 h-7">
        {!reviewOn ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-track px-2.75 py-1.25 text-[12.5px] font-semibold text-ink-muted">
            {tr.card.notInReview}
          </span>
        ) : stats.due > 0 ? (
          <span className="inline-flex items-center gap-1.75 rounded-full border border-accent-soft-border bg-accent-soft px-2.75 py-1.25 text-[12.5px] font-semibold text-accent-soft-text">
            <span className="h-1.75 w-1.75 rounded-full bg-accent-dot" />
            {tr.card.due(stats.due)}
          </span>
        ) : (
          stats.total > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-track px-2.75 py-1.25 text-[12.5px] font-semibold text-ink-soft">
              <span className="text-success">✓</span>
              {tr.card.reviewed}
            </span>
          )
        )}
      </div>

      <div className="mt-4.5 flex items-center gap-2.5">
        {reviewOn && (
          <Link
            to="/openings/$openingId/study"
            params={{ openingId: opening.id }}
            search={{ program: false }}
            className="btn-accent flex h-10.5 flex-1 items-center justify-center rounded-[10px] text-sm font-semibold"
          >
            {tr.card.review}
          </Link>
        )}
        <Link
          to="/openings/$openingId"
          params={{ openingId: opening.id }}
          className="flex h-10.5 flex-1 items-center justify-center rounded-[10px] border border-line-strong bg-surface-high text-sm font-semibold text-ink transition hover:bg-field"
        >
          {tr.card.open}
        </Link>
      </div>
    </li>
  );
}

function EmptyState({ selected }: { selected: FolderFilter }) {
  const tr = useHomeStrings();
  const msg = selected === 'none' ? tr.empty.root : tr.empty.folder;
  return (
    <div className="rounded-card border border-dashed border-on-dash bg-ground-overlay p-16 text-center text-on-muted">
      {msg}
    </div>
  );
}

type ImportMode = 'pgn' | 'lichess' | 'file';

function ImportModal({ onClose }: { onClose: () => void }) {
  const tr = useHomeStrings();
  const navigate = useNavigate();
  const folders = useStored(() => foldersRepo.list());
  const [mode, setMode] = useState<ImportMode>('pgn');
  const [pgnText, setPgnText] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState<Color>('white');
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'preview' | 'done' | 'error'
  >('idle');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [pendingResults, setPendingResults] = useState<ImportResult[]>([]);
  const [folderTarget, setFolderTarget] = useState<'new' | 'existing' | 'none'>(
    'new',
  );
  const [newFolderName, setNewFolderName] = useState('');
  const [existingFolderId, setExistingFolderId] = useState<string>('');

  const loadFile = async (file: File) => {
    setStatus('loading');
    try {
      const text = await file.text();
      setPgnText(text);
      setMode('pgn');
      setStatus('idle');
    } catch (e) {
      setStatus('error');
      setError((e as Error).message);
    }
  };

  const submit = async () => {
    setStatus('loading');
    setError('');
    setSummary('');
    try {
      const pgn = mode === 'lichess' ? await fetchLichessStudy(url) : pgnText;
      if (!pgn.trim()) throw new Error(tr.importModal.errEmptyPgn);
      const results =
        mode === 'lichess'
          ? [importLichessStudy(pgn, color)]
          : importFromPgn(pgn, color);
      const valid = results.filter(r =>
        r.opening.lines.some(l => l.moves.length > 0),
      );
      if (valid.length === 0) throw new Error(tr.importModal.errNoGames);
      if (valid.length === 1) {
        openingsRepo.save(valid[0].opening);
        onClose();
        navigate({
          to: '/openings/$openingId',
          params: { openingId: valid[0].opening.id },
        });
      } else {
        const studyName = valid.find(r => r.studyName)?.studyName ?? '';
        setNewFolderName(studyName);
        setFolderTarget(studyName ? 'new' : 'none');
        setExistingFolderId(folders[0]?.id ?? '');
        setPendingResults(valid);
        setStatus('preview');
      }
    } catch (e) {
      setStatus('error');
      setError((e as Error).message);
    }
  };

  const confirmImport = () => {
    let folderId: string | undefined;
    if (folderTarget === 'new' && newFolderName.trim()) {
      const folder: Folder = {
        id: crypto.randomUUID(),
        name: newFolderName.trim(),
        createdAt: Date.now(),
      };
      foldersRepo.save(folder);
      folderId = folder.id;
    } else if (folderTarget === 'existing' && existingFolderId) {
      folderId = existingFolderId;
    }
    for (const r of pendingResults) {
      openingsRepo.save({ ...r.opening, folderId });
    }
    setStatus('done');
    setSummary(
      tr.importModal.imported(
        pendingResults.length,
        folderId ? foldersRepo.get(folderId)?.name : undefined,
      ),
    );
  };

  const cancelPreview = () => {
    setPendingResults([]);
    setStatus('idle');
  };

  const canSubmit =
    status !== 'loading' &&
    status !== 'preview' &&
    ((mode === 'pgn' && pgnText.trim().length > 0) ||
      (mode === 'lichess' && url.trim().length > 0));

  if (status === 'preview') {
    return (
      <Modal open onClose={cancelPreview} title={tr.importModal.previewTitle}>
        <div className="space-y-4">
          <p className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-text">
            {tr.importModal.willCreateLead}
            <strong>{tr.importModal.willCreateCount(pendingResults.length)}</strong>.
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border border-line bg-field p-2 text-xs">
            <ul className="space-y-1">
              {pendingResults.map((r, i) => (
                <li key={r.opening.id} className="flex gap-2 truncate">
                  <span className="w-6 shrink-0 text-right text-ink-muted">
                    {i + 1}.
                  </span>
                  <span className="truncate text-ink-soft">{r.opening.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-meta">
              {tr.importModal.groupLabel}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'new', label: tr.importModal.folderNew },
                  { id: 'existing', label: tr.importModal.folderExisting },
                  { id: 'none', label: tr.importModal.folderNone },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFolderTarget(opt.id)}
                  disabled={opt.id === 'existing' && folders.length === 0}
                  className={`rounded-[10px] border px-3 py-2.5 text-[14.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    folderTarget === opt.id
                      ? 'border-accent bg-surface text-ink shadow-resting'
                      : 'border-line-strong text-ink-soft hover:bg-track hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {folderTarget === 'new' && (
              <input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder={tr.folders.namePlaceholder}
                className="w-full rounded-md border border-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent-soft-border focus:outline-none"
              />
            )}
            {folderTarget === 'existing' && (
              <select
                value={existingFolderId}
                onChange={e => setExistingFolderId(e.target.value)}
                className="w-full rounded-md border border-line bg-field px-3 py-2 text-sm text-ink focus:border-accent-soft-border focus:outline-none"
              >
                {folders.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-meta">
            {tr.importModal.playedSide(color === 'white' ? tr.white : tr.black)}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={cancelPreview}
              className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:text-ink"
            >
              {tr.importModal.back}
            </button>
            <button
              onClick={confirmImport}
              disabled={folderTarget === 'new' && newFolderName.trim().length === 0}
              className="rounded-lg btn-accent px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {tr.importModal.confirm}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={tr.importModal.title}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'pgn', label: 'PGN' },
              { id: 'lichess', label: 'Lichess Study' },
              { id: 'file', label: tr.importModal.modeFile },
            ] as const
          ).map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-[10px] border px-3 py-2.5 text-[14.5px] font-medium transition ${
                mode === m.id
                  ? 'border-accent bg-surface text-ink shadow-resting'
                  : 'border-line-strong text-ink-soft hover:bg-track hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'pgn' && (
          <textarea
            value={pgnText}
            onChange={e => setPgnText(e.target.value)}
            placeholder={tr.importModal.pgnPlaceholder}
            rows={8}
            className="w-full resize-none rounded-md border border-line bg-surface-high p-2 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-accent-soft-border focus:outline-none"
          />
        )}
        {mode === 'lichess' && (
          <div>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://lichess.org/study/STUDYID[/CHAPTERID]"
              className="w-full rounded-md border border-line bg-surface-high px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent-soft-border focus:outline-none"
            />
            <p className="mt-1 text-xs text-meta">
              {tr.importModal.lichessHint}
            </p>
          </div>
        )}
        {mode === 'file' && (
          <input
            type="file"
            accept=".pgn,text/plain"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
            }}
            className="block w-full text-sm text-ink-soft file:mr-3 file:cursor-pointer file:rounded-[10px] file:border file:border-line-strong file:bg-surface-high file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-field"
          />
        )}

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-meta">
            {tr.importModal.sideLabel}
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['white', 'black'] as const).map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`rounded-[10px] border px-3 py-2.5 text-[14.5px] font-medium transition ${
                  color === c
                    ? 'border-accent bg-surface text-ink shadow-resting'
                    : 'border-line-strong text-ink-soft hover:bg-track hover:text-ink'
                }`}
              >
                {c === 'white' ? tr.white : tr.black}
              </button>
            ))}
          </div>
        </div>

        {status === 'error' && error && (
          <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
        {status === 'done' && summary && (
          <p className="rounded-md border border-success-border bg-success-soft px-3 py-2 text-sm text-success-text">
            {summary}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:text-ink"
          >
            {status === 'done' ? tr.importModal.close : tr.importModal.cancel}
          </button>
          {status !== 'done' && (
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-lg btn-accent px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === 'loading' ? tr.importModal.importing : tr.importModal.submit}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
