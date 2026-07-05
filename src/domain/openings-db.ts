// Opening recognition. Indexes the lichess-org/chess-openings dataset
// (vendored under src/data/eco/) by the canonical position key, so move-order
// transpositions resolve to the same name — the way lichess and chess.com
// label openings during analysis.
//
// The index is lazy-loaded via dynamic import so it lives in its own ~60 KB
// gzipped chunk; the home/study routes don't pay for it.
//
// Refresh the snapshot by re-running `npm run openings:index`.

import { applyUci, chessFromFen, fenOf, positionKey, START_FEN } from './chess';

export type Opening = { eco: string; name: string };

type Index = Record<string, Opening>;

let cache: Index | null = null;
let loading: Promise<Index> | null = null;

function load(): Promise<Index> {
  if (cache) return Promise.resolve(cache);
  if (loading) return loading;
  loading = import('../data/openings-index.json').then(m => {
    cache = m.default as Index;
    loading = null;
    return cache;
  });
  return loading;
}

export type OpeningMatch = Opening & {
  /** Ply (0 = starting position) at which this entry matched. */
  ply: number;
};

/**
 * Walks the line ply-by-ply up to (and including) `upTo` and returns EVERY
 * dataset entry encountered along the way, shallowest first. The last one is
 * the deepest name (what analysis boards display); the earlier ones let a
 * caller reason about the opening *family* (e.g. the first "Italian Game"
 * hit, before variation suffixes pile up).
 *
 * `startFen` defaults to the standard initial position. Lichess study
 * chapters that begin past the opening pass their `chapter.startFen` here
 * so the move sequence resolves against the right board — otherwise
 * `applyUci` would replay illegal moves from the wrong starting position
 * and the recognizer would never match a dataset entry.
 */
export async function recognizeOpeningMatches(
  uciMoves: string[],
  upTo: number,
  startFen: string = START_FEN,
): Promise<OpeningMatch[]> {
  const db = await load();
  let chess = chessFromFen(startFen);
  const matches: OpeningMatch[] = [];
  const start = db[positionKey(fenOf(chess))];
  if (start) matches.push({ ...start, ply: 0 });
  const plies = Math.min(upTo, uciMoves.length);
  for (let i = 0; i < plies; i++) {
    chess = applyUci(chess, uciMoves[i]);
    const match = db[positionKey(fenOf(chess))];
    if (match) matches.push({ ...match, ply: i + 1 });
  }
  return matches;
}

/** Deepest opening name reached — the chess.com / lichess analysis label. */
export async function recognizeOpening(
  uciMoves: string[],
  upTo: number,
  startFen: string = START_FEN,
): Promise<Opening | null> {
  const matches = await recognizeOpeningMatches(uciMoves, upTo, startFen);
  const last = matches[matches.length - 1];
  return last ? { eco: last.eco, name: last.name } : null;
}
