import type { Card, Opening } from '../domain/types';

const KEY_OPENINGS = 'gambit.openings';
const KEY_CARDS = 'gambit.cards';

let cachedOpenings: Opening[] | null = null;
let cachedCards: Card[] | null = null;

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
  if (cachedOpenings === null) cachedOpenings = read<Opening[]>(KEY_OPENINGS, []);
  return cachedOpenings;
}

function readCards(): Card[] {
  if (cachedCards === null) cachedCards = read<Card[]>(KEY_CARDS, []);
  return cachedCards;
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
};
