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
    const chapterId = crypto.randomUUID();
    const opening: Opening = {
      id,
      name: name.trim(),
      color,
      chapters: [{ id: chapterId, name: 'Principal', order: 0 }],
      lines: [
        { id: crypto.randomUUID(), name: 'Ligne 1', chapterId, moves: [] },
      ],
      createdAt: now,
      updatedAt: now,
    };
    openingsRepo.save(opening);
    navigate({ to: '/openings/$openingId/edit', params: { openingId: id } });
  };

  return (
    <main className="mx-auto max-w-md px-10 pt-12 pb-20">
      <h1 className="text-[32px] font-extrabold tracking-[-0.02em]">
        Nouvelle ouverture
      </h1>
      <form onSubmit={submit} className="mt-8 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-ink-soft">Nom</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Sicilienne — Najdorf"
            autoFocus
            className="mt-2 w-full rounded-[10px] border border-line-strong bg-field px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-accent-soft-border focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink-soft">
            Couleur jouée
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {(['white', 'black'] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`rounded-[10px] border px-3 py-2.5 text-sm font-semibold transition ${
                  color === c
                    ? 'border-accent bg-accent-soft text-accent-soft-text'
                    : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-high'
                }`}
              >
                {c === 'white' ? 'Blancs' : 'Noirs'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => navigate({ to: '/' })}
            className="rounded-btn px-4 py-2.5 text-sm font-semibold text-ink-soft transition hover:text-ink"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="btn-accent rounded-btn px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Créer
          </button>
        </div>
      </form>
    </main>
  );
}
