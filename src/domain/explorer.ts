// Lichess opening explorer client, CORS-open — queried by FEN so
// transpositions and custom-start chapters resolve for free.
// Docs: https://lichess.org/api#tag/Opening-Explorer
//
// Since 2026 the endpoints sit behind OAuth (`security: OAuth2: []` in the
// spec — anonymous requests get a bare nginx 401). The token comes from the
// connected Lichess account (lichessAuth); there is no manual-token path.
//
// Results are cached per (source, positionKey) for the session: scrubbing
// back and forth through a line costs one request per distinct position.

import { positionKey } from './chess';
import { getAccount } from './lichessAuth';

// One-time cleanup of the pre-OAuth pasted-token storage.
try {
  localStorage.removeItem('gambit.lichess.token');
} catch {
  /* ignored */
}

export type ExplorerSource = 'lichess' | 'masters';

export type ExplorerMoveStats = {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  total: number;
};

export type ExplorerResult = {
  white: number;
  draws: number;
  black: number;
  /** Games reaching the position (all moves included, even unlisted ones). */
  total: number;
  moves: ExplorerMoveStats[];
};

/** Thrown on HTTP 429 — callers show a "retry shortly" state instead of a
 * generic error, and the module stays quiet for a cooldown window. */
export class ExplorerRateLimited extends Error {
  constructor() {
    super('explorer rate limited');
  }
}

/** Thrown on HTTP 401 — the caller prompts for a Lichess API token. */
export class ExplorerUnauthorized extends Error {
  constructor() {
    super('explorer unauthorized');
  }
}

export function explorerUrl(fen: string, source: ExplorerSource): string {
  const params = new URLSearchParams({ fen, moves: '12', topGames: '0' });
  if (source === 'lichess') {
    params.set('variant', 'standard');
    params.set('speeds', 'blitz,rapid,classical');
    params.set('ratings', '1800,2000,2200,2500');
    params.set('recentGames', '0');
  }
  return `https://explorer.lichess.org/${source}?${params}`;
}

type RawMove = {
  uci?: unknown;
  san?: unknown;
  white?: unknown;
  draws?: unknown;
  black?: unknown;
};
type RawResponse = {
  white?: unknown;
  draws?: unknown;
  black?: unknown;
  moves?: RawMove[];
};

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

export function parseExplorerResponse(raw: RawResponse): ExplorerResult {
  const white = num(raw.white);
  const draws = num(raw.draws);
  const black = num(raw.black);
  const moves = (Array.isArray(raw.moves) ? raw.moves : [])
    .filter(m => typeof m.uci === 'string' && typeof m.san === 'string')
    .map(m => {
      const w = num(m.white);
      const d = num(m.draws);
      const b = num(m.black);
      return {
        uci: m.uci as string,
        san: m.san as string,
        white: w,
        draws: d,
        black: b,
        total: w + d + b,
      };
    });
  return { white, draws, black, total: white + draws + black, moves };
}

const cache = new Map<string, ExplorerResult>();
const inflight = new Map<string, Promise<ExplorerResult>>();
/** After a 429, don't touch the API again before this timestamp. The docs
 * say to wait a minute before retrying after a rate-limit hit. */
let cooldownUntil = 0;
const COOLDOWN_MS = 60_000;

export async function fetchExplorer(
  fen: string,
  source: ExplorerSource,
): Promise<ExplorerResult> {
  const key = `${source}:${positionKey(fen)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  if (Date.now() < cooldownUntil) throw new ExplorerRateLimited();

  const p = (async () => {
    const token = getAccount()?.token;
    const res = await fetch(explorerUrl(fen, source), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new ExplorerUnauthorized();
    if (res.status === 429) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      throw new ExplorerRateLimited();
    }
    if (!res.ok) throw new Error(`Explorer HTTP ${res.status}`);
    const result = parseExplorerResponse(await res.json());
    cache.set(key, result);
    return result;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}
