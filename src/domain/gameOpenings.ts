// What openings does the user actually PLAY? Recognize each fetched game
// against the ECO dataset and aggregate per opening *family* — the part
// before the ':' in dataset names ("Italian Game: Classical Variation" →
// "Italian Game") — split by color. Feeds the played-openings stats and the
// "create a repertoire for this" proposal: the seed is the move prefix the
// user most often played to reach the family's deepest recognized position,
// so the new repertoire starts from their real games, not from theory.

import {
  applyUci,
  chessFromFen,
  fenOf,
  positionKey,
  sansToUcis,
  START_FEN,
} from './chess';
import { familyOf, recognizeOpeningMatches } from './openings-db';
import type { RecentGame } from './lichessGames';
import type { Color } from './types';

/** Opening theory rarely stays *named* past this depth; capping keeps the
 * per-game walk cheap over a couple hundred games. */
const RECOGNITION_PLIES = 24;

export type PlayedOpeningStat = {
  /** Family name, e.g. "Scotch Game". */
  name: string;
  /** ECO code of the first family-level match. */
  eco: string;
  color: Color;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Most frequently played UCI prefix reaching the family's recognized
   * depth — the seed for a fresh repertoire. */
  seedUcis: string[];
  /** Position key where the family FIRST matched ALONG THE WINNING SEED —
   * the right depth to test "is this family already covered by the
   * repertoire". Tied to the seed route: a repertoire created from the seed
   * is guaranteed to pass through it, so the "create" button flips to
   * covered right after creation. */
  familyKey: string;
};


const keyAtPly = (ucis: string[], ply: number): string => {
  let chess = chessFromFen(START_FEN);
  for (let i = 0; i < ply; i++) chess = applyUci(chess, ucis[i]);
  return positionKey(fenOf(chess));
};

export async function aggregatePlayedOpenings(
  games: RecentGame[],
): Promise<PlayedOpeningStat[]> {
  type Acc = Omit<PlayedOpeningStat, 'seedUcis' | 'familyKey'> & {
    /** One entry per distinct in-book route, with the ply where the family
     * first matched along THAT route — the winning route provides both the
     * seed and the coverage key, so they can never disagree. */
    seedVotes: Map<string, { votes: number; familyPly: number }>;
  };
  const acc = new Map<string, Acc>();

  for (const game of games) {
    const ucis = sansToUcis(game.sans, START_FEN, RECOGNITION_PLIES);
    if (ucis.length === 0) continue;
    const matches = await recognizeOpeningMatches(ucis, ucis.length);
    const deepest = matches[matches.length - 1];
    if (!deepest || deepest.ply === 0) continue;
    const family = familyOf(deepest.name);
    const familyFirst = matches.find(m => familyOf(m.name) === family) ?? deepest;

    const k = `${game.userColor}|${family}`;
    let a = acc.get(k);
    if (!a) {
      a = {
        name: family,
        eco: familyFirst.eco,
        color: game.userColor,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        seedVotes: new Map(),
      };
      acc.set(k, a);
    }
    a.games++;
    if (game.result === 'win') a.wins++;
    else if (game.result === 'draw') a.draws++;
    else a.losses++;
    const seed = ucis.slice(0, deepest.ply).join(' ');
    const vote = a.seedVotes.get(seed);
    if (vote) vote.votes++;
    else a.seedVotes.set(seed, { votes: 1, familyPly: familyFirst.ply });
  }

  const out: PlayedOpeningStat[] = [];
  for (const a of acc.values()) {
    let bestSeed = '';
    let bestFamilyPly = 0;
    let bestVotes = -1;
    for (const [seed, { votes, familyPly }] of a.seedVotes) {
      if (votes > bestVotes) {
        bestVotes = votes;
        bestSeed = seed;
        bestFamilyPly = familyPly;
      }
    }
    const seedUcis = bestSeed ? bestSeed.split(' ') : [];
    out.push({
      name: a.name,
      eco: a.eco,
      color: a.color,
      games: a.games,
      wins: a.wins,
      draws: a.draws,
      losses: a.losses,
      familyKey: keyAtPly(seedUcis, bestFamilyPly),
      seedUcis,
    });
  }
  return out.sort((x, y) => y.games - x.games);
}
