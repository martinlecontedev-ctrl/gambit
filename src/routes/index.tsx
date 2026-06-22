import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Modal } from '../components/Modal';
import {
  fetchLichessStudy,
  importFromPgn,
  importLichessStudy,
  type ImportResult,
} from '../domain/pgn';
import { reviewsToday } from '../domain/activity';
import { openingStats, type OpeningStats } from '../domain/cards';
import type { Card, Color, Folder, Opening } from '../domain/types';
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ouvertures</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {openings.length === 0
              ? 'Créez votre première ouverture pour commencer.'
              : `${openings.length} ouverture${openings.length > 1 ? 's' : ''} · ${folders.length} dossier${folders.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            Importer
          </button>
          <Link
            to="/openings/new"
            className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
          >
            + Nouvelle ouverture
          </Link>
        </div>
      </div>

      {openings.length > 0 && (
        <ReviewBanner
          totalDue={totalDue}
          done={done}
          dueOpenings={dueOpenings}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
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
          <ul className="grid auto-rows-max gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
    </div>
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
  const displayTotal = done + totalDue;
  const pct = displayTotal > 0 ? Math.round((done / displayTotal) * 100) : 0;

  if (totalDue === 0) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-6 py-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-400">
          ✓
        </span>
        <div>
          <p className="text-lg font-semibold">Tout est à jour</p>
          <p className="text-sm text-zinc-400">
            {done > 0
              ? `${done} position${done > 1 ? 's' : ''} révisée${done > 1 ? 's' : ''} aujourd'hui.`
              : "Rien à réviser pour aujourd'hui."}
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="text-5xl font-bold tabular-nums leading-none text-emerald-400">
            {totalDue}
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight">
              position{totalDue > 1 ? 's' : ''} à réviser aujourd'hui
            </p>
            <p className="mt-0.5 text-sm text-zinc-400">
              réparti{totalDue > 1 ? 'es' : 'e'} sur {dueOpenings.length} ouverture
              {dueOpenings.length > 1 ? 's' : ''}
              {namesLabel && ` · ${namesLabel}`}
            </p>
          </div>
        </div>
        <Link
          to="/openings/$openingId/study"
          params={{ openingId: dueOpenings[0].id }}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Démarrer la révision
        </Link>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
          {done} faite{done > 1 ? 's' : ''} · {totalDue} restante
          {totalDue > 1 ? 's' : ''}
        </span>
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
    let message = `Supprimer le dossier "${folder.name}" ?`;
    if (count > 0) {
      const plural = count > 1;
      message +=
        `\n\n⚠️  LE CONTENU DE CE DOSSIER SERA ÉGALEMENT SUPPRIMÉ.` +
        `\n\n${count} ouverture${plural ? 's' : ''} ${plural ? 'vont' : 'va'} disparaître, avec leurs lignes, annotations et cartes de révision.` +
        `\n\nCette action est définitive.`;
    }
    if (confirm(message)) {
      foldersRepo.delete(folder.id);
    }
  };

  return (
    <aside className="space-y-1">
      <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Dossiers
      </h2>
      <SidebarItem
        label="Sans dossier"
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
        <div className="px-2 py-1">
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
            placeholder="Nom du dossier"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
        >
          + Nouveau dossier
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
      className={`group relative rounded-md transition ${
        hovered
          ? 'bg-zinc-700/60 ring-1 ring-inset ring-zinc-500'
          : active
            ? 'bg-zinc-800 text-zinc-100'
            : 'hover:bg-zinc-900'
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
          className="w-full rounded-md bg-transparent px-3 py-2 text-sm text-zinc-100 focus:outline-none"
        />
      ) : (
        <button
          onClick={onClick}
          className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
            active ? 'text-zinc-100' : 'text-zinc-300 hover:text-zinc-100'
          }`}
        >
          <span className="truncate">{label}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {due > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-300">
                {due}
              </span>
            )}
            <span className="text-xs text-zinc-500">{count}</span>
          </span>
        </button>
      )}
      {!renaming && (onRenameStart || onDelete) && (
        <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-zinc-700 px-1 py-0.5 opacity-0 shadow-sm ring-1 ring-zinc-600/60 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
          {onRenameStart && (
            <button
              onClick={e => {
                e.stopPropagation();
                onRenameStart();
              }}
              title="Renommer"
              className="rounded p-1 text-xs text-zinc-300 transition hover:bg-zinc-600 hover:text-zinc-50"
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
              title="Supprimer le dossier"
              className="rounded p-1 text-xs text-zinc-300 transition hover:bg-red-900/60 hover:text-red-200"
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
  const masteryPct =
    stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
  return (
    <li
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', opening.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition hover:border-zinc-700 active:cursor-grabbing ${
        isDragged ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">{opening.name}</h2>
          <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
            {opening.color === 'white' ? 'Blancs' : 'Noirs'} · {opening.lines.length} ligne
            {opening.lines.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => {
            if (
              confirm(
                `Supprimer "${opening.name}" ?\n\nLes lignes, annotations et cartes de révision associées seront perdues.`,
              )
            ) {
              openingsRepo.delete(opening.id);
            }
          }}
          title="Supprimer cette ouverture"
          aria-label="Supprimer cette ouverture"
          className="rounded p-1 text-base leading-none text-zinc-600 transition hover:bg-red-950/40 hover:text-red-400"
        >
          ✕
        </button>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wider text-zinc-500">
            Maîtrise
          </span>
          <span className="font-semibold tabular-nums text-emerald-400">
            {masteryPct}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${masteryPct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 h-6">
        {stats.due > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {stats.due} à réviser
          </span>
        ) : (
          stats.total > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/70 px-2.5 py-1 text-xs font-medium text-zinc-400">
              <span className="text-emerald-400">✓</span>
              Révisé
            </span>
          )
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Link
          to="/openings/$openingId/study"
          params={{ openingId: opening.id }}
          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Réviser
        </Link>
        <Link
          to="/openings/$openingId/edit"
          params={{ openingId: opening.id }}
          className="flex-1 rounded-lg border border-zinc-800 px-3 py-2 text-center text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
        >
          Éditer
        </Link>
      </div>
    </li>
  );
}

function EmptyState({ selected }: { selected: FolderFilter }) {
  const msg =
    selected === 'none'
      ? 'Aucune ouverture hors dossier.'
      : 'Ce dossier est vide. Glisse-dépose une ouverture ici depuis un autre dossier.';
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-16 text-center text-zinc-500">
      {msg}
    </div>
  );
}

type ImportMode = 'pgn' | 'lichess' | 'file';

function ImportModal({ onClose }: { onClose: () => void }) {
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
      if (!pgn.trim()) throw new Error('PGN vide');
      const results =
        mode === 'lichess'
          ? [importLichessStudy(pgn, color)]
          : importFromPgn(pgn, color);
      const valid = results.filter(r =>
        r.opening.lines.some(l => l.moves.length > 0),
      );
      if (valid.length === 0) throw new Error('Aucune partie avec coups trouvée');
      if (valid.length === 1) {
        openingsRepo.save(valid[0].opening);
        onClose();
        navigate({
          to: '/openings/$openingId/edit',
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
      `${pendingResults.length} ouvertures importées${
        folderId ? ` dans "${foldersRepo.get(folderId)?.name}"` : ''
      }.`,
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
      <Modal open onClose={cancelPreview} title="Confirmer l'import">
        <div className="space-y-4">
          <p className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
            L'import va créer <strong>{pendingResults.length} nouvelles ouvertures</strong>.
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 p-2 text-xs">
            <ul className="space-y-1">
              {pendingResults.map((r, i) => (
                <li key={r.opening.id} className="flex gap-2 truncate">
                  <span className="w-6 shrink-0 text-right text-zinc-600">
                    {i + 1}.
                  </span>
                  <span className="truncate text-zinc-300">{r.opening.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Regrouper dans un dossier
            </label>
            <div className="flex gap-1 rounded-lg bg-zinc-950 p-1">
              {(
                [
                  { id: 'new', label: 'Nouveau' },
                  { id: 'existing', label: 'Existant' },
                  { id: 'none', label: 'Aucun' },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFolderTarget(opt.id)}
                  disabled={opt.id === 'existing' && folders.length === 0}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    folderTarget === opt.id
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
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
                placeholder="Nom du dossier"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              />
            )}
            {folderTarget === 'existing' && (
              <select
                value={existingFolderId}
                onChange={e => setExistingFolderId(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              >
                {folders.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-zinc-500">
            Camp joué : {color === 'white' ? 'Blancs' : 'Noirs'}.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={cancelPreview}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100"
            >
              Retour
            </button>
            <button
              onClick={confirmImport}
              disabled={folderTarget === 'new' && newFolderName.trim().length === 0}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirmer
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Importer une ouverture">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-zinc-950 p-1">
          {(
            [
              { id: 'pgn', label: 'PGN' },
              { id: 'lichess', label: 'Lichess Study' },
              { id: 'file', label: 'Fichier' },
            ] as const
          ).map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
                mode === m.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
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
            placeholder="Colle ton PGN ici"
            rows={8}
            className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        )}
        {mode === 'lichess' && (
          <div>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://lichess.org/study/STUDYID[/CHAPTERID]"
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Études publiques uniquement. Un chapitre = une ouverture.
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
            className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:text-zinc-100 hover:file:bg-zinc-700"
          />
        )}

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
            Camp joué
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['white', 'black'] as const).map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  color === c
                    ? 'border-zinc-100 bg-zinc-100 text-zinc-900'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {c === 'white' ? 'Blancs' : 'Noirs'}
              </button>
            ))}
          </div>
        </div>

        {status === 'error' && error && (
          <p className="rounded-md bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {status === 'done' && summary && (
          <p className="rounded-md bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            {summary}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100"
          >
            {status === 'done' ? 'Fermer' : 'Annuler'}
          </button>
          {status !== 'done' && (
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === 'loading' ? 'Import…' : 'Importer'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
