import type { Card, Folder, Opening, ReviewEvent } from '../domain/types';

/**
 * Bring an opening up to the current shape. Openings stored before the
 * `chapters` field was introduced get a default "Principal" chapter that
 * adopts every existing line. Idempotent: re-running on an already-migrated
 * opening returns it untouched.
 */
function migrateOpening(o: Opening): Opening {
  const hasChapters = Array.isArray(o.chapters) && o.chapters.length > 0;
  const allLinesHaveChapter =
    hasChapters && o.lines.every(l => l.chapterId !== undefined);
  if (hasChapters && allLinesHaveChapter) return o;

  const chapters =
    hasChapters && o.chapters
      ? o.chapters
      : [{ id: crypto.randomUUID(), name: 'Principal', order: 0 }];
  const fallbackChapterId = chapters[0].id;
  return {
    ...o,
    chapters,
    lines: o.lines.map(l =>
      l.chapterId ? l : { ...l, chapterId: fallbackChapterId },
    ),
  };
}

const KEY_OPENINGS = 'gambit.openings';
const KEY_CARDS = 'gambit.cards';
const KEY_FOLDERS = 'gambit.folders';
const KEY_REVIEWS = 'gambit.reviews';

/** Keep review history bounded: events older than a year are dropped on write.
 * Enough for "done today", the login streak, and a year-long heatmap, while
 * keeping the parsed array (and localStorage footprint) from growing forever. */
const REVIEW_RETENTION_MS = 365 * 86_400_000;

let cachedOpenings: Opening[] | null = null;
let cachedCards: Card[] | null = null;
let cachedFolders: Folder[] | null = null;
let cachedReviews: ReviewEvent[] | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function invalidate() {
  cachedOpenings = null;
  cachedCards = null;
  cachedFolders = null;
  cachedReviews = null;
  listeners.forEach(l => l());
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readOpenings(): Opening[] {
  if (cachedOpenings === null) {
    const raw = read<Opening[]>(KEY_OPENINGS, []);
    cachedOpenings = raw.map(migrateOpening);
    // Persist migrations right away: migrateOpening mints fresh chapter ids,
    // and minting different ids on the next session would orphan every card
    // keyed on them (the chapterId is part of the card's composite id).
    if (cachedOpenings.some((o, i) => o !== raw[i])) {
      localStorage.setItem(KEY_OPENINGS, JSON.stringify(cachedOpenings));
    }
  }
  return cachedOpenings;
}

function readCards(): Card[] {
  if (cachedCards === null) cachedCards = read<Card[]>(KEY_CARDS, []);
  return cachedCards;
}

function readFolders(): Folder[] {
  if (cachedFolders === null) cachedFolders = read<Folder[]>(KEY_FOLDERS, []);
  return cachedFolders;
}

function readReviews(): ReviewEvent[] {
  if (cachedReviews === null) cachedReviews = read<ReviewEvent[]>(KEY_REVIEWS, []);
  return cachedReviews;
}

export const openingsRepo = {
  list: readOpenings,
  get: (id: string): Opening | undefined => readOpenings().find(o => o.id === id),
  save: (opening: Opening): void => {
    const all = [...readOpenings()];
    const i = all.findIndex(o => o.id === opening.id);
    if (i >= 0) all[i] = opening;
    else all.push(opening);
    localStorage.setItem(KEY_OPENINGS, JSON.stringify(all));
    invalidate();
  },
  delete: (id: string): void => {
    const openings = readOpenings().filter(o => o.id !== id);
    const cards = readCards().filter(c => c.openingId !== id);
    localStorage.setItem(KEY_OPENINGS, JSON.stringify(openings));
    localStorage.setItem(KEY_CARDS, JSON.stringify(cards));
    invalidate();
  },
};

export const cardsRepo = {
  list: readCards,
  upsert: (card: Card): void => {
    const all = [...readCards()];
    const i = all.findIndex(c => c.id === card.id);
    if (i >= 0) all[i] = card;
    else all.push(card);
    localStorage.setItem(KEY_CARDS, JSON.stringify(all));
    invalidate();
  },
  /** Drop every card matching the predicate in one localStorage write. Used
   * for cascading deletes (chapter removal) without exposing the bulk
   * storage API to callers. No-op when nothing matches. */
  dropWhere: (predicate: (c: Card) => boolean): void => {
    const all = readCards();
    const remaining = all.filter(c => !predicate(c));
    if (remaining.length === all.length) return;
    localStorage.setItem(KEY_CARDS, JSON.stringify(remaining));
    invalidate();
  },
};

export const reviewsRepo = {
  list: readReviews,
  /** Log one review action. Prunes events older than the retention window in
   * the same write (cutoff is relative to the event being appended). */
  append: (event: ReviewEvent): void => {
    const cutoff = event.ts - REVIEW_RETENTION_MS;
    const kept = readReviews().filter(r => r.ts >= cutoff);
    kept.push(event);
    localStorage.setItem(KEY_REVIEWS, JSON.stringify(kept));
    invalidate();
  },
};

export const foldersRepo = {
  list: readFolders,
  get: (id: string): Folder | undefined => readFolders().find(f => f.id === id),
  save: (folder: Folder): void => {
    const all = [...readFolders()];
    const i = all.findIndex(f => f.id === folder.id);
    if (i >= 0) all[i] = folder;
    else all.push(folder);
    localStorage.setItem(KEY_FOLDERS, JSON.stringify(all));
    invalidate();
  },
  /** Drop the folder along with every opening (and their SRS cards) that
   * lived inside. Openings belonging to other folders or to the root level
   * stay untouched. */
  delete: (id: string): void => {
    const allOpenings = readOpenings();
    const removedOpeningIds = new Set(
      allOpenings.filter(o => o.folderId === id).map(o => o.id),
    );
    const folders = readFolders().filter(f => f.id !== id);
    const remainingOpenings = allOpenings.filter(o => o.folderId !== id);
    const remainingCards = readCards().filter(
      c => !removedOpeningIds.has(c.openingId),
    );
    localStorage.setItem(KEY_FOLDERS, JSON.stringify(folders));
    localStorage.setItem(KEY_OPENINGS, JSON.stringify(remainingOpenings));
    localStorage.setItem(KEY_CARDS, JSON.stringify(remainingCards));
    invalidate();
  },
};
