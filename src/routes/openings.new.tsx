import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import type { Color, Opening } from '../domain/types';
import { openingsRepo } from '../storage/repository';

export const Route = createFileRoute('/openings/new')({ component: NewOpening });

function NewOpening() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('white');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = crypto.randomUUID();
    const now = Date.now();
    const opening: Opening = {
      id,
      name: name.trim(),
      color,
      lines: [{ id: crypto.randomUUID(), name: 'Ligne 1', moves: [] }],
      createdAt: now,
      updatedAt: now,
    };
    openingsRepo.save(opening);
    navigate({ to: '/openings/$openingId/edit', params: { openingId: id } });
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Nouvelle ouverture</h1>
      <form onSubmit={submit} className="mt-8 space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-300">Nom</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Sicilienne — Najdorf"
            autoFocus
            className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300">Couleur jouée</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['white', 'black'] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  color === c
                    ? 'border-zinc-100 bg-zinc-100 text-zinc-900'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {c === 'white' ? 'Blancs' : 'Noirs'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate({ to: '/' })}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Créer
          </button>
        </div>
      </form>
    </div>
  );
}
