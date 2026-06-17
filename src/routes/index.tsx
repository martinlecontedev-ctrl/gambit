import { createFileRoute, Link } from '@tanstack/react-router';
import { cardsRepo, openingsRepo } from '../storage/repository';
import { useStored } from '../storage/store';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const openings = useStored(() => openingsRepo.list());
  const cards = useStored(() => cardsRepo.list());
  const now = Date.now();

  const dueByOpening = new Map<string, number>();
  for (const c of cards) {
    if (c.due <= now) dueByOpening.set(c.openingId, (dueByOpening.get(c.openingId) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ouvertures</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {openings.length === 0
              ? 'Créez votre première ouverture pour commencer.'
              : `${openings.length} ouverture${openings.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          to="/openings/new"
          className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
        >
          + Nouvelle ouverture
        </Link>
      </div>

      {openings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-16 text-center text-zinc-500">
          Aucune ouverture pour le moment.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {openings.map(o => {
            const due = dueByOpening.get(o.id) ?? 0;
            return (
              <li
                key={o.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium tracking-tight">{o.name}</h2>
                    <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
                      {o.color === 'white' ? 'Blancs' : 'Noirs'} · {o.lines.length} ligne
                      {o.lines.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {due > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                      {due} dû
                    </span>
                  )}
                </div>
                <div className="mt-6 flex items-center gap-2">
                  <Link
                    to="/openings/$openingId/study"
                    params={{ openingId: o.id }}
                    className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-center text-sm font-medium transition hover:bg-zinc-700"
                  >
                    Réviser
                  </Link>
                  <Link
                    to="/openings/$openingId/edit"
                    params={{ openingId: o.id }}
                    className="flex-1 rounded-lg border border-zinc-800 px-3 py-2 text-center text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                  >
                    Éditer
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
