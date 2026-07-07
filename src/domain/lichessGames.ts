// Recent games of the connected Lichess account, as ND-JSON from the games
// export API. One request per refresh; standard-chess speeds only so the
// deviation report compares apples to apples with the repertoire.

import type { Color } from './types';

export type RecentGame = {
  id: string;
  speed: string;
  rated: boolean;
  opponent: string;
  opponentRating?: number;
  userColor: Color;
  result: 'win' | 'draw' | 'loss';
  /** SAN moves, in order. */
  sans: string[];
  createdAt: number;
};

type RawPlayer = {
  user?: { name?: string };
  rating?: number;
  aiLevel?: number;
};
type RawGame = {
  id?: string;
  speed?: string;
  rated?: boolean;
  winner?: string;
  moves?: string;
  createdAt?: number;
  players?: { white?: RawPlayer; black?: RawPlayer };
};

function playerLabel(p: RawPlayer | undefined): {
  name: string;
  rating?: number;
} {
  if (p?.aiLevel) return { name: `Stockfish niv. ${p.aiLevel}` };
  return { name: p?.user?.name ?? 'Anonyme', rating: p?.rating };
}

/** Parse the ND-JSON body. Games where `username` isn't one of the players
 * (shouldn't happen) and unparsable lines are dropped. */
export function parseGamesNdjson(body: string, username: string): RecentGame[] {
  const games: RecentGame[] = [];
  const me = username.toLowerCase();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let raw: RawGame;
    try {
      raw = JSON.parse(trimmed) as RawGame;
    } catch {
      continue;
    }
    if (!raw.id) continue;
    const whiteName = raw.players?.white?.user?.name?.toLowerCase();
    const blackName = raw.players?.black?.user?.name?.toLowerCase();
    const userColor: Color | null =
      whiteName === me ? 'white' : blackName === me ? 'black' : null;
    if (!userColor) continue;
    const them = playerLabel(
      userColor === 'white' ? raw.players?.black : raw.players?.white,
    );
    games.push({
      id: raw.id,
      speed: raw.speed ?? '',
      rated: raw.rated ?? false,
      opponent: them.name,
      opponentRating: them.rating,
      userColor,
      result:
        raw.winner === userColor ? 'win' : raw.winner ? 'loss' : 'draw',
      sans: (raw.moves ?? '').split(' ').filter(Boolean),
      createdAt: raw.createdAt ?? 0,
    });
  }
  return games;
}

/** Session cache shared by the Lichess tab and the fidelity cards. Expires
 * after a short TTL so a long-lived SPA still sees new games — without it,
 * a leak acknowledged "Révisé ✓" could never reopen after a fresh miss
 * until a full page reload. */
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { username: string; games: RecentGame[]; at: number } | null = null;

export async function fetchRecentGames(
  username: string,
  token: string,
  max = 15,
): Promise<RecentGame[]> {
  const params = new URLSearchParams({
    max: String(max),
    moves: 'true',
    perfType: 'bullet,blitz,rapid,classical',
  });
  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`,
    {
      headers: {
        Accept: 'application/x-ndjson',
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) throw new Error(`Lichess games HTTP ${res.status}`);
  const games = parseGamesNdjson(await res.text(), username);
  cache = { username: username.toLowerCase(), games, at: Date.now() };
  return games;
}

export async function fetchRecentGamesCached(
  username: string,
  token: string,
  max = 15,
): Promise<RecentGame[]> {
  if (
    cache?.username === username.toLowerCase() &&
    Date.now() - cache.at < CACHE_TTL_MS
  ) {
    return cache.games;
  }
  return fetchRecentGames(username, token, max);
}
