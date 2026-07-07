import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { Chessboard } from '../components/Chessboard';
import { FigurineSan } from '../components/FigurineSan';
import { chessFromFen, moveNumberLabel, sameMove } from '../domain/chess';
import { fetchExplorer } from '../domain/explorer';
import {
  analyzeGame,
  buildPositionOwners,
  buildRepertoireBook,
  findLineForPath,
  type DeviationVerdict,
} from '../domain/deviation';
import {
  getAccount,
  login,
  logout,
  subscribeAccount,
  type LichessAccount,
} from '../domain/lichessAuth';
import {
  aggregatePlayedOpenings,
  type PlayedOpeningStat,
} from '../domain/gameOpenings';
import {
  fetchRecentGames,
  fetchRecentGamesCached,
  type RecentGame,
} from '../domain/lichessGames';
import {
  pushOpeningToStudy,
  StudyWriteUnauthorized,
} from '../domain/lichessStudySync';
import { parentForNewVariant } from '../domain/tree';
import type { Line, Opening } from '../domain/types';
import { LOCALES, useLang } from '../i18n';
import { useLichessStrings } from '../i18n/lichess';
import { openingsRepo, studySyncRepo } from '../storage/repository';
import { useStored } from '../storage/store';

export const Route = createFileRoute('/lichess')({ component: LichessPage });

/** Games fetched for the analyses; the list paginates them. */
const GAMES_MAX = 200;
const PAGE_SIZE = 20;

/** Only deviations from move 4 on get flagged: before that it's just
 * "another opening was played", not repertoire feedback. */
const MIN_DEVIATION_PLY = 6;
/** An opponent novelty must run deep (move 5+) before the game row offers
 * to graft it — shallow one-offs are anecdotes, not lines to prep. */
const MIN_ADD_LINE_PLY = 8;
/** A user move this popular in the Lichess database is another OPENING, not
 * a miss — the played-openings card handles that case; the deviation chip
 * only fires below this share. */
const POPULAR_MOVE_SHARE = 0.1;

/** The verdict key holds the four meaningful FEN fields; pad the clocks to
 * rebuild a full FEN for boards and explorer queries. */
const fenFromKey = (key: string): string => `${key} 0 1`;

type Deviation = Extract<
  DeviationVerdict,
  { kind: 'user-left' } | { kind: 'opponent-left' }
>;

const significantDeviation = (v: DeviationVerdict): Deviation | undefined =>
  (v.kind === 'user-left' || v.kind === 'opponent-left') &&
  v.ply >= MIN_DEVIATION_PLY
    ? v
    : undefined;

function LichessPage() {
  const openings = useStored(() => openingsRepo.list());
  const account = useSyncExternalStore(subscribeAccount, getAccount, getAccount);
  const navigate = useNavigate();
  const tr = useLichessStrings();
  const [games, setGames] = useState<RecentGame[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const books = useMemo(
    () => ({
      white: buildRepertoireBook(openings, 'white'),
      black: buildRepertoireBook(openings, 'black'),
    }),
    [openings],
  );

  const owners = useMemo(
    () => ({
      white: buildPositionOwners(openings, 'white'),
      black: buildPositionOwners(openings, 'black'),
    }),
    [openings],
  );

  // One walk per game per repertoire change, shared by the rows and the
  // popularity lookups — re-analyzing on every render (which the sequential
  // popularity updates trigger repeatedly) would redo the same work.
  const verdictByGame = useMemo(() => {
    const m = new Map<string, DeviationVerdict>();
    for (const g of games ?? []) {
      m.set(g.id, analyzeGame(g.sans, g.userColor, books[g.userColor]));
    }
    return m;
  }, [games, books]);

  /** Exercise session on the exact position where the user left book. */
  const reviseMissed = (openingId: string, pos: string) => {
    navigate({
      to: '/openings/$openingId/study',
      params: { openingId },
      search: { program: false, pos },
    });
  };

  /** Graft the opponent's novelty as a variant of the line the game was
   * following, then land in the editor right after it — ready for the
   * user's reply. */
  const addOpponentLine = (
    target: { openingId: string; lineId: string },
    verdict: Extract<DeviationVerdict, { kind: 'opponent-left' }>,
  ) => {
    const latest = openingsRepo.get(target.openingId);
    if (!latest) return;
    const line = latest.lines.find(l => l.id === target.lineId);
    if (!line) return;
    // Already grafted (double-click, or the novelty was added from another
    // game): reuse the existing line instead of stacking identical variants.
    const full = [...verdict.path, verdict.playedUci];
    const existing = findLineForPath([latest], latest.color, full);
    if (existing) {
      navigate({
        to: '/openings/$openingId/edit',
        params: { openingId: existing.openingId },
        search: { line: existing.lineId, ply: full.length },
      });
      return;
    }
    const chapterLines = latest.lines.filter(l => l.chapterId === line.chapterId);
    const parent = parentForNewVariant(chapterLines, line, verdict.path.length);
    const variant: Line = {
      id: crypto.randomUUID(),
      name: tr.defaults.variant,
      chapterId: line.chapterId,
      parentLineId: parent.id,
      moves: full,
    };
    openingsRepo.save({
      ...latest,
      lines: [...latest.lines, variant],
      updatedAt: Date.now(),
    });
    navigate({
      to: '/openings/$openingId/edit',
      params: { openingId: target.openingId },
      search: { line: variant.id, ply: variant.moves.length },
    });
  };

  const load = (acc: LichessAccount, force = false) => {
    setStatus('loading');
    const fetcher = force ? fetchRecentGames : fetchRecentGamesCached;
    fetcher(acc.username, acc.token, GAMES_MAX)
      .then(gs => {
        setGames(gs);
        setStatus('idle');
      })
      .catch(() => setStatus('error'));
  };

  useEffect(() => {
    if (account) load(account);
    else setGames(null);
  }, [account]);

  // Popularity of the user's deviating moves in the Lichess database — a
  // popular move means "another opening was played on purpose", so the chip
  // stays silent. Lookups run sequentially (API guideline) over DISTINCT
  // positions only; the explorer client caches per position for the session.
  const [popularity, setPopularity] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!games) {
      setPopularity(new Map());
      return;
    }
    const candidates = new Map<string, { fen: string; playedUci: string }>();
    for (const g of games) {
      const v = verdictByGame.get(g.id);
      if (v && v.kind === 'user-left' && v.ply >= MIN_DEVIATION_PLY) {
        const k = `${v.key}|${v.playedUci}`;
        if (!candidates.has(k)) {
          candidates.set(k, { fen: fenFromKey(v.key), playedUci: v.playedUci });
        }
      }
    }
    if (candidates.size === 0) {
      setPopularity(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const shares = new Map<string, number>();
      for (const [k, c] of candidates) {
        if (cancelled) return;
        try {
          const res = await fetchExplorer(c.fen, 'lichess');
          const chess = chessFromFen(c.fen);
          const hit = res.moves.find(m => sameMove(chess, m.uci, c.playedUci));
          shares.set(k, res.total > 0 ? (hit?.total ?? 0) / res.total : 0);
        } catch {
          // Unknown popularity (rate limit, offline): the row stays silent
          // rather than risking a false "you missed X".
        }
        if (!cancelled) setPopularity(new Map(shares));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [games, verdictByGame]);

  // Played-openings aggregation (async: the ECO index is lazy-loaded).
  const [playedStats, setPlayedStats] = useState<PlayedOpeningStat[] | null>(null);
  useEffect(() => {
    if (!games) {
      setPlayedStats(null);
      return;
    }
    let cancelled = false;
    aggregatePlayedOpenings(games).then(stats => {
      if (!cancelled) setPlayedStats(stats);
    });
    return () => {
      cancelled = true;
    };
  }, [games]);

  /** Fresh repertoire seeded with the user's own most-played moves. */
  const createRepertoire = (stat: PlayedOpeningStat) => {
    // Double-click / already-created guard: never silently stack a
    // same-named opening.
    if (openings.some(o => o.name === stat.name)) {
      alert(tr.playedOpenings.alreadyExists(stat.name));
      return;
    }
    const now = Date.now();
    const chapterId = crypto.randomUUID();
    const lineId = crypto.randomUUID();
    const opening: Opening = {
      id: crypto.randomUUID(),
      name: stat.name,
      color: stat.color,
      chapters: [{ id: chapterId, name: tr.defaults.mainChapter, order: 0 }],
      lines: [{ id: lineId, name: tr.defaults.firstLine, chapterId, moves: stat.seedUcis }],
      createdAt: now,
      updatedAt: now,
    };
    openingsRepo.save(opening);
    navigate({
      to: '/openings/$openingId/edit',
      params: { openingId: opening.id },
      search: { line: lineId, ply: stat.seedUcis.length },
    });
  };

  return (
    <main className="mx-auto max-w-260 px-10 pt-10 pb-20">
      <div className="mb-6.5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[42px] font-extrabold leading-none tracking-[-0.02em] text-on-ink">
            Lichess
          </h1>
          <p className="mt-2 text-[15px] text-on-muted">
            {account ? tr.header.connectedAs(account.username) : tr.header.tagline}
          </p>
        </div>
        {account && (
          <div className="flex gap-3">
            <button
              onClick={() => load(account, true)}
              disabled={status === 'loading'}
              className="h-11 rounded-btn border border-chip-border bg-chip px-4.5 text-[14.5px] font-semibold text-chip-text shadow-resting transition hover:border-chip-hover disabled:opacity-40"
            >
              {tr.header.refresh}
            </button>
            <button
              onClick={logout}
              className="h-11 rounded-btn border border-chip-border bg-chip px-4.5 text-[14.5px] font-semibold text-chip-text shadow-resting transition hover:border-danger-border hover:bg-danger-soft hover:text-danger-text"
            >
              {tr.header.signOut}
            </button>
          </div>
        )}
      </div>

      {!account ? (
        <ConnectCard />
      ) : (
        <div className="space-y-5">
          <PlayedOpeningsCard
            stats={playedStats}
            owners={owners}
            onCreate={createRepertoire}
          />
          <GamesCard
            games={games}
            status={status}
            renderRow={g => {
              const verdict = verdictByGame.get(g.id);
              let deviation = verdict ? significantDeviation(verdict) : undefined;
              // A user deviation only counts once the Lichess database
              // confirms the played move is rare — popular = other opening.
              if (deviation?.kind === 'user-left') {
                const share = popularity.get(
                  `${deviation.key}|${deviation.playedUci}`,
                );
                if (share === undefined || share >= POPULAR_MOVE_SHARE) {
                  deviation = undefined;
                }
              }
              const reviseTarget =
                deviation?.kind === 'user-left'
                  ? owners[g.userColor].get(deviation.key)
                  : undefined;
              const addTarget =
                deviation?.kind === 'opponent-left' &&
                deviation.ply >= MIN_ADD_LINE_PLY
                  ? findLineForPath(openings, g.userColor, deviation.path)
                  : undefined;
              return (
                <GameRow
                  key={g.id}
                  game={g}
                  deviation={deviation}
                  onRevise={
                    reviseTarget && deviation?.kind === 'user-left'
                      ? () => reviseMissed(reviseTarget, deviation.key)
                      : undefined
                  }
                  onAddLine={
                    addTarget && deviation?.kind === 'opponent-left'
                      ? () => addOpponentLine(addTarget, deviation)
                      : undefined
                  }
                />
              );
            }}
          />
          <SyncCard openings={openings} account={account} />
        </div>
      )}
    </main>
  );
}

function ConnectCard() {
  const tr = useLichessStrings();
  return (
    <div className="flex flex-col items-center rounded-[18px] border border-line bg-surface px-8 py-14 text-center text-ink shadow-card">
      <p className="text-lg font-bold">{tr.connect.title}</p>
      <p className="mt-2 max-w-md text-sm text-meta">{tr.connect.body}</p>
      <button
        onClick={() => void login()}
        className="btn-accent mt-7 flex h-11 items-center rounded-btn px-6 text-[14.5px] font-semibold"
      >
        {tr.connect.button}
      </button>
    </div>
  );
}

const TOP_OPENINGS = 5;

/**
 * What the user actually plays, per color, most played first. Openings whose
 * family position isn't in the repertoire get a "create it" shortcut, seeded
 * with the moves the user really plays — creating it also silences the
 * coach's "you miss X" noise for that line, since the union book then knows
 * both theories.
 */
function PlayedOpeningsCard({
  stats,
  owners,
  onCreate,
}: {
  stats: PlayedOpeningStat[] | null;
  owners: Record<'white' | 'black', Map<string, string>>;
  onCreate: (stat: PlayedOpeningStat) => void;
}) {
  const tr = useLichessStrings();
  if (stats === null) return null;
  const columns: { color: 'white' | 'black'; label: string }[] = [
    { color: 'white', label: tr.playedOpenings.white },
    { color: 'black', label: tr.playedOpenings.black },
  ];
  return (
    <div className="rounded-[18px] border border-line bg-surface px-6 py-5 shadow-card">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        {tr.playedOpenings.title}
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        {columns.map(({ color, label }) => {
          const rows = stats.filter(s => s.color === color).slice(0, TOP_OPENINGS);
          return (
            <div key={color}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-soft">
                {label}
              </div>
              {rows.length === 0 ? (
                <p className="py-1 text-sm text-meta">{tr.playedOpenings.empty}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map((s, i) => (
                    <PlayedOpeningRow
                      key={`${s.color}-${s.name}`}
                      stat={s}
                      favorite={i === 0}
                      covered={owners[s.color].has(s.familyKey)}
                      onCreate={() => onCreate(s)}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayedOpeningRow({
  stat,
  favorite,
  covered,
  onCreate,
}: {
  stat: PlayedOpeningStat;
  favorite: boolean;
  covered: boolean;
  onCreate: () => void;
}) {
  const tr = useLichessStrings();
  const wp = (stat.wins / stat.games) * 100;
  const dp = (stat.draws / stat.games) * 100;
  const lp = 100 - wp - dp;
  return (
    <li
      className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-track"
      title={tr.playedOpenings.rowTitle(stat.games, stat.wins, stat.draws, stat.losses)}
    >
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
        {stat.name}
        {favorite && (
          <span className="ml-1.5 rounded-full border border-accent-soft-border bg-accent-soft px-1.5 py-px text-[10.5px] font-bold text-accent-soft-text">
            {tr.playedOpenings.favourite}
          </span>
        )}
      </span>
      <span className="w-8 shrink-0 text-right text-[11.5px] text-ink-muted tnum">
        ×{stat.games}
      </span>
      <span className="flex h-4 w-28 shrink-0 overflow-hidden rounded border border-line text-[9px] font-bold leading-none tnum">
        <span
          className="flex items-center justify-center bg-success-soft text-success-text"
          style={{ width: `${wp}%` }}
        >
          {wp >= 25 ? Math.round(wp) : ''}
        </span>
        <span
          className="flex items-center justify-center bg-line-strong text-ink-soft"
          style={{ width: `${dp}%` }}
        >
          {dp >= 25 ? Math.round(dp) : ''}
        </span>
        <span
          className="flex items-center justify-center bg-danger-soft text-danger-text"
          style={{ width: `${lp}%` }}
        >
          {lp >= 25 ? Math.round(lp) : ''}
        </span>
      </span>
      {covered ? (
        <span
          className="w-30 shrink-0 text-right text-[11.5px] text-ink-muted"
          title={tr.playedOpenings.coveredTitle}
        >
          {tr.playedOpenings.covered}
        </span>
      ) : (
        <button
          onClick={onCreate}
          title={tr.playedOpenings.createTitle}
          className="w-30 shrink-0 rounded-full border border-accent-soft-border bg-accent-soft px-2 py-1 text-[11.5px] font-semibold text-accent-soft-text transition hover:brightness-[0.98]"
        >
          {tr.playedOpenings.create}
        </button>
      )}
    </li>
  );
}

function GamesCard({
  games,
  status,
  renderRow,
}: {
  games: RecentGame[] | null;
  status: 'idle' | 'loading' | 'error';
  renderRow: (game: RecentGame) => React.ReactNode;
}) {
  const tr = useLichessStrings();
  const [page, setPage] = useState(0);
  // Fresh data (refresh, reconnect) restarts on the first page.
  useEffect(() => {
    setPage(0);
  }, [games]);

  const pageCount = games ? Math.max(1, Math.ceil(games.length / PAGE_SIZE)) : 1;
  const current = Math.min(page, pageCount - 1);

  return (
    <div className="rounded-[18px] border border-line bg-surface px-6 py-5 text-ink shadow-card">
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        {tr.games.title}
      </div>
      {status === 'error' ? (
        <p className="py-2 text-sm text-meta">{tr.games.loadError}</p>
      ) : games === null ? (
        <p className="animate-pulse py-2 text-sm text-meta">{tr.games.loading}</p>
      ) : games.length === 0 ? (
        <p className="py-2 text-sm text-meta">{tr.games.empty}</p>
      ) : (
        <>
          <ul
            className={`divide-y divide-line transition-opacity ${
              status === 'loading' ? 'opacity-50' : ''
            }`}
          >
            {games
              .slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
              .map(renderRow)}
          </ul>
          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <button
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                className="text-[12.5px] font-semibold text-ink-muted transition hover:text-ink disabled:opacity-40"
              >
                {tr.games.prev}
              </button>
              <span className="text-[12.5px] text-meta tnum">
                {tr.games.pageInfo(current + 1, pageCount, games.length)}
              </span>
              <button
                onClick={() => setPage(current + 1)}
                disabled={current >= pageCount - 1}
                className="text-[12.5px] font-semibold text-ink-muted transition hover:text-ink disabled:opacity-40"
              >
                {tr.games.next}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Push-only mirror of the repertoire into private Lichess studies — one
 * study per opening, created on first push, replaced chapter-wise after.
 * The SRS state stays local; this protects the repertoire content only.
 */
function SyncCard({
  openings,
  account,
}: {
  openings: Opening[];
  account: LichessAccount;
}) {
  const tr = useLichessStrings();
  const lang = useLang();
  const syncMap = useStored(() => studySyncRepo.all());
  const [pushing, setPushing] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [authIssue, setAuthIssue] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  const pushable = (o: Opening) => o.lines.some(l => l.moves.length > 0);

  const push = async (o: Opening): Promise<boolean> => {
    setPushing(p => ({ ...p, [o.id]: true }));
    setFailed(f => ({ ...f, [o.id]: false }));
    try {
      const sync = await pushOpeningToStudy(o, account.token, studySyncRepo.get(o.id));
      studySyncRepo.set(o.id, sync);
      return true;
    } catch (e) {
      if (e instanceof StudyWriteUnauthorized) setAuthIssue(true);
      else setFailed(f => ({ ...f, [o.id]: true }));
      return false;
    } finally {
      setPushing(p => ({ ...p, [o.id]: false }));
    }
  };

  const pushAll = async () => {
    setBusyAll(true);
    // Sequential on purpose: one request at a time, per the API guidelines.
    for (const o of openings) {
      if (!pushable(o)) continue;
      const ok = await push(o);
      if (!ok) break;
    }
    setBusyAll(false);
  };

  const pushedLabel = (openingId: string): string | undefined => {
    const sync = syncMap[openingId];
    if (!sync) return undefined;
    return new Date(sync.pushedAt).toLocaleString(LOCALES[lang], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="rounded-[18px] border border-line bg-surface px-6 py-5 shadow-card">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {tr.sync.title}
        </span>
        <button
          onClick={() => void pushAll()}
          disabled={busyAll || openings.every(o => !pushable(o))}
          className="text-[12.5px] font-semibold text-ink-muted transition hover:text-ink disabled:opacity-40"
        >
          {busyAll ? tr.sync.pushing : tr.sync.pushAll}
        </button>
      </div>

      {authIssue && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning-border bg-warning-soft px-3 py-2">
          <span className="text-sm text-warning-text">{tr.sync.authIssue}</span>
          <button
            onClick={() => void login()}
            className="btn-accent rounded-md px-3 py-1.5 text-xs font-semibold"
          >
            {tr.sync.reconnect}
          </button>
        </div>
      )}

      {openings.length === 0 ? (
        <p className="py-2 text-sm text-meta">{tr.sync.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {openings.map(o => {
            const sync = syncMap[o.id];
            const label = pushedLabel(o.id);
            return (
              <li
                key={o.id}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-track"
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                  {o.name}
                </span>
                <span className="shrink-0 text-[12px] text-ink-muted">
                  {failed[o.id]
                    ? tr.sync.failed
                    : label
                      ? tr.sync.pushedAt(label)
                      : tr.sync.neverPushed}
                </span>
                {sync && (
                  <a
                    href={`https://lichess.org/study/${sync.studyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={tr.sync.openStudyTitle}
                    className="shrink-0 px-1 text-[12.5px] font-semibold text-ink-muted transition hover:text-ink"
                  >
                    ↗
                  </a>
                )}
                <button
                  onClick={() => void push(o)}
                  disabled={!!pushing[o.id] || busyAll || !pushable(o)}
                  title={pushable(o) ? tr.sync.pushTitle : tr.sync.pushEmptyTitle}
                  className="shrink-0 rounded-full border border-chip-border bg-chip px-2.5 py-1 text-[12px] font-semibold text-chip-text transition hover:border-chip-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pushing[o.id] ? tr.sync.pushing : tr.sync.push}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GameRow({
  game,
  deviation,
  onRevise,
  onAddLine,
}: {
  game: RecentGame;
  /** Set only for a flagged deviation — rows without one stay unlabeled. */
  deviation: Deviation | undefined;
  onRevise?: () => void;
  onAddLine?: () => void;
}) {
  const tr = useLichessStrings();
  const lang = useLang();
  const date = new Date(game.createdAt).toLocaleDateString(LOCALES[lang], {
    day: 'numeric',
    month: 'short',
  });
  const resultTone =
    game.result === 'win'
      ? 'border-success-border bg-success-soft text-success-text'
      : game.result === 'loss'
        ? 'border-danger-border bg-danger-soft text-danger-text'
        : 'border-line bg-track text-ink-soft';
  const resultLabel =
    game.result === 'win'
      ? tr.results.win
      : game.result === 'loss'
        ? tr.results.loss
        : tr.results.draw;

  const [open, setOpen] = useState(false);

  return (
    <li>
      <div className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-track">
        <span className="w-13 shrink-0 text-[11.5px] text-ink-muted">{date}</span>
        <span className="w-16 shrink-0 text-[11.5px] text-ink-muted">
          {tr.speeds[game.speed] ?? game.speed}
        </span>
        <span
          className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${resultTone}`}
        >
          {resultLabel}
        </span>
        <span className="w-44 shrink-0 truncate text-[13.5px] font-medium text-ink">
          {game.opponent}
          {game.opponentRating !== undefined && (
            <span className="text-ink-muted tnum"> {game.opponentRating}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {deviation && (
            <button
              onClick={() => setOpen(o => !o)}
              title={open ? tr.games.hideBifurcation : tr.games.showBifurcation}
              className="max-w-full truncate align-middle"
            >
              <VerdictChip deviation={deviation} />
              <span className="ml-1 align-middle text-[10px] text-ink-muted">
                {open ? '▴' : '▾'}
              </span>
            </button>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {onRevise && (
            <button
              onClick={onRevise}
              title={tr.games.reviseTitle}
              className="rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent-soft-text transition hover:brightness-[0.98]"
            >
              {tr.games.revise}
            </button>
          )}
          {onAddLine && (
            <button
              onClick={onAddLine}
              title={tr.games.addLineTitle}
              className="rounded-full border border-chip-border bg-chip px-2.5 py-1 text-[12px] font-semibold text-chip-text transition hover:border-chip-hover"
            >
              {tr.games.addLine}
            </button>
          )}
          <a
            href={`https://lichess.org/${game.id}/${game.userColor}#${deviation?.ply ?? 0}`}
            target="_blank"
            rel="noopener noreferrer"
            title={deviation ? tr.games.openAtDeviation : tr.games.openGame}
            className="px-1 text-[12.5px] font-semibold text-ink-muted transition hover:text-ink"
          >
            ↗
          </a>
        </span>
      </div>
      {open && deviation && (
        <BifurcationPanel deviation={deviation} orientation={game.userColor} />
      )}
    </li>
  );
}

/**
 * The fork position itself, inline: played move in red, repertoire moves in
 * green — the "what should have happened here" mini-view behind each chip.
 */
function BifurcationPanel({
  deviation,
  orientation,
}: {
  deviation: Deviation;
  orientation: 'white' | 'black';
}) {
  const tr = useLichessStrings();
  const config: Config = useMemo(
    () => ({
      fen: fenFromKey(deviation.key),
      orientation,
      viewOnly: true,
      coordinates: false,
      animation: { enabled: false },
      drawable: {
        enabled: false,
        visible: true,
        autoShapes: [
          {
            orig: deviation.playedUci.slice(0, 2) as Key,
            dest: deviation.playedUci.slice(2, 4) as Key,
            brush: 'red',
          },
          ...deviation.expectedUcis.map(uci => ({
            orig: uci.slice(0, 2) as Key,
            dest: uci.slice(2, 4) as Key,
            brush: 'green',
          })),
        ],
      },
    }),
    [deviation, orientation],
  );

  return (
    <div className="mb-2 flex items-start gap-5 rounded-xl border border-line bg-field p-4">
      <Chessboard
        config={config}
        className="aspect-square w-64 shrink-0 overflow-hidden rounded-lg ring-1 ring-board-frame"
      />
      <div className="space-y-2 pt-1 text-[13px]">
        <p>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-danger" />
          {deviation.kind === 'user-left'
            ? tr.bifurcation.you
            : tr.bifurcation.opponent}{' '}
          <span className="font-semibold">
            <FigurineSan san={deviation.played} />
          </span>
        </p>
        <p>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-success" />
          {tr.bifurcation.repertoire}{' '}
          {deviation.expected.map((san, i) => (
            <span key={i} className="font-semibold">
              {i > 0 && ' / '}
              <FigurineSan san={san} />
            </span>
          ))}
        </p>
        <p className="text-meta">
          {deviation.kind === 'user-left'
            ? tr.bifurcation.userHint
            : tr.bifurcation.opponentHint}
        </p>
      </div>
    </div>
  );
}

function VerdictChip({ deviation }: { deviation: Deviation }) {
  const tr = useLichessStrings();
  const base =
    'inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 text-[12px] font-semibold';
  if (deviation.kind === 'user-left') {
    return (
      <span
        className={`${base} border-danger-border bg-danger-soft text-danger-text`}
      >
        {tr.verdicts.userLeftPlayed(moveNumberLabel(deviation.ply))}{' '}
        <FigurineSan san={deviation.played} />
        {tr.verdicts.userLeftExpected}{' '}
        {deviation.expected.map((san, i) => (
          <span key={i}>
            {i > 0 && ' / '}
            <FigurineSan san={san} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={`${base} border-info-border bg-info-soft text-info-text`}>
      {tr.verdicts.opponentLeft(moveNumberLabel(deviation.ply))} (
      <FigurineSan san={deviation.played} />)
    </span>
  );
}
