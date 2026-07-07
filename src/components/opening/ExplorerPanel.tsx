import { useEffect, useState, useSyncExternalStore } from 'react';
import { FigurineSan } from '../FigurineSan';
import {
  ExplorerRateLimited,
  ExplorerUnauthorized,
  fetchExplorer,
  type ExplorerMoveStats,
  type ExplorerResult,
  type ExplorerSource,
} from '../../domain/explorer';
import { getAccount, login, subscribeAccount } from '../../domain/lichessAuth';

const EXPLORER_SOURCES: { id: ExplorerSource; label: string }[] = [
  { id: 'masters', label: 'Masters' },
  { id: 'lichess', label: 'Lichess' },
];

const GAMES_FMT = new Intl.NumberFormat('fr-FR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Lichess opening explorer panel: for the position under the cursor, the
 * most played moves with their game share and the win/draw/loss split.
 * Opt-in (talks to the public Lichess API) and persisted, like the engine
 * toggle. Clicking a move plays it through `playMove`, so the usual
 * variant/chapter rules apply.
 */
export function ExplorerPanel({
  fen,
  onPlayMove,
}: {
  fen: string;
  onPlayMove: (uci: string) => void;
}) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gambit.explorer.enabled') === '1';
    } catch {
      return false;
    }
  });
  const [source, setSource] = useState<ExplorerSource>(() => {
    try {
      // Masters is the default: an explicit 'lichess' choice is respected,
      // anything else (unset, legacy value) falls back to masters.
      return localStorage.getItem('gambit.explorer.source') === 'lichess'
        ? 'lichess'
        : 'masters';
    } catch {
      return 'masters';
    }
  });
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'limited' | 'unauthorized' | 'error'
  >('ready');
  // The Lichess session feeds the Authorization header — refetch when it
  // appears (login completes async after the OAuth redirect).
  const account = useSyncExternalStore(subscribeAccount, getAccount, getAccount);

  const toggle = () => {
    setEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem('gambit.explorer.enabled', next ? '1' : '0');
      } catch {
        /* ignored */
      }
      return next;
    });
  };

  const pickSource = (s: ExplorerSource) => {
    setSource(s);
    try {
      localStorage.setItem('gambit.explorer.source', s);
    } catch {
      /* ignored */
    }
  };

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('loading');
    // Debounced: scrubbing through a line must not fire one request per ply.
    // The previous result stays visible (dimmed) while the new one loads.
    const t = setTimeout(() => {
      fetchExplorer(fen, source)
        .then(r => {
          if (cancelled) return;
          setResult(r);
          setStatus('ready');
        })
        .catch(e => {
          if (cancelled) return;
          setStatus(
            e instanceof ExplorerUnauthorized
              ? 'unauthorized'
              : e instanceof ExplorerRateLimited
                ? 'limited'
                : 'error',
          );
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, fen, source, account]);

  return (
    <div className="rounded-[14px] border border-line bg-surface p-4 text-ink shadow-resting">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        Explorateur
      </div>
      {/* Controls sit under the title: the 240px column can't fit them on
          the same line. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {enabled &&
          EXPLORER_SOURCES.map(s => (
            <button
              key={s.id}
              onClick={() => pickSource(s.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition ${
                source === s.id
                  ? 'border-accent-soft-border bg-accent-soft text-accent-soft-text'
                  : 'border-chip-border bg-chip text-chip-text hover:border-chip-hover'
              }`}
            >
              {s.label}
            </button>
          ))}
        <button
          onClick={toggle}
          title={
            enabled
              ? 'Désactiver l’explorateur'
              : 'Activer (interroge l’API publique de Lichess)'
          }
          className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition ${
            enabled
              ? 'border-info-border bg-info-soft text-info-text'
              : 'border-chip-border bg-chip text-chip-text hover:border-chip-hover'
          }`}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {!enabled ? (
        <p className="text-[12.5px] text-meta">
          Coups les plus joués et résultats associés (parties Lichess 1800+ ou
          parties de maîtres), pour la position affichée.
        </p>
      ) : status === 'unauthorized' ? (
        <div className="space-y-2.5">
          <p className="text-[12.5px] text-meta">
            {account
              ? 'Session Lichess expirée ou révoquée — reconnecte ton compte.'
              : "L'explorateur passe par ton compte Lichess (gratuit, aucun scope demandé)."}
          </p>
          <button
            onClick={() => void login()}
            className="btn-accent w-full rounded-md px-3 py-2 text-xs font-semibold"
          >
            Connecter mon compte Lichess
          </button>
        </div>
      ) : status === 'error' ? (
        <p className="text-[12.5px] text-meta">Explorateur indisponible.</p>
      ) : status === 'limited' ? (
        <p className="text-[12.5px] text-warning-text">
          Limite de l'API atteinte — l'explorateur se met en pause une minute.
        </p>
      ) : !result ? (
        <p className="animate-pulse text-[12.5px] text-meta">Chargement…</p>
      ) : result.moves.length === 0 ? (
        <p className="text-[12.5px] text-meta">
          Aucune partie dans cette base pour cette position.
        </p>
      ) : (
        <div
          className={`transition-opacity ${status === 'loading' ? 'opacity-45' : ''}`}
        >
          <p className="mb-2 text-[11.5px] text-meta tnum">
            {GAMES_FMT.format(result.total)} parties
          </p>
          <div className="space-y-1">
            {result.moves.map(m => (
              <ExplorerRow
                key={m.uci}
                move={m}
                positionTotal={result.total}
                onPlay={() => onPlayMove(m.uci)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExplorerRow({
  move,
  positionTotal,
  onPlay,
}: {
  move: ExplorerMoveStats;
  positionTotal: number;
  onPlay: () => void;
}) {
  const share =
    positionTotal > 0 ? Math.round((move.total / positionTotal) * 100) : 0;
  const wp = move.total > 0 ? (move.white / move.total) * 100 : 0;
  const dp = move.total > 0 ? (move.draws / move.total) * 100 : 0;
  const bp = move.total > 0 ? 100 - wp - dp : 0;
  return (
    <div
      className="flex items-center gap-2"
      title={`${move.total.toLocaleString('fr-FR')} parties · Blancs ${Math.round(wp)}% · Nulles ${Math.round(dp)}% · Noirs ${Math.round(bp)}%`}
    >
      <button
        onClick={onPlay}
        className="w-14 shrink-0 rounded-md px-1.5 py-0.5 text-left text-[13.5px] font-semibold text-ink transition hover:bg-track"
      >
        <FigurineSan san={move.san} />
      </button>
      <span className="w-9 shrink-0 text-right text-[11.5px] text-ink-muted tnum">
        {share}%
      </span>
      <div className="flex h-4 flex-1 overflow-hidden rounded border border-line text-[9px] font-bold leading-none tnum">
        <div
          className="flex items-center justify-center bg-surface-high text-ink-soft"
          style={{ width: `${wp}%` }}
        >
          {wp >= 18 ? `${Math.round(wp)}` : ''}
        </div>
        <div
          className="flex items-center justify-center bg-line-strong text-ink-soft"
          style={{ width: `${dp}%` }}
        >
          {dp >= 18 ? `${Math.round(dp)}` : ''}
        </div>
        <div
          className="flex items-center justify-center bg-ink text-surface"
          style={{ width: `${bp}%` }}
        >
          {bp >= 18 ? `${Math.round(bp)}` : ''}
        </div>
      </div>
    </div>
  );
}
