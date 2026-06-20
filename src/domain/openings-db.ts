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

/**
 * Walks the line ply-by-ply up to (and including) `upTo` and returns the
 * deepest opening name reached — matching the chess.com / lichess behaviour
 * during analysis. Returns `null` if no position along the way is in the
 * dataset (e.g. the user is in a novelty past the known theory).
 */
export async function recognizeOpening(
  uciMoves: string[],
  upTo: number,
): Promise<Opening | null> {
  const db = await load();
  let chess = chessFromFen(START_FEN);
  let best: Opening | null = db[positionKey(fenOf(chess))] ?? null;
  const plies = Math.min(upTo, uciMoves.length);
  for (let i = 0; i < plies; i++) {
    chess = applyUci(chess, uciMoves[i]);
    const match = db[positionKey(fenOf(chess))];
    if (match) best = match;
  }
  return best;
}
