import { useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal';

export function ChapterNameModal({
  forced,
  defaultName,
  onConfirm,
  onCancel,
}: {
  forced: boolean;
  defaultName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  // Select the prefilled text on first focus so a single keypress overwrites
  // the suggestion when the user wants a different name.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.select();
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };
  return (
    <Modal open onClose={onCancel} title="Nouveau chapitre">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-meta">
          {forced
            ? 'Tu joues un coup différent sur ta couleur. Donne un nom au chapitre qui va porter cette variante — la révision saura ainsi quelle théorie tu veux driller.'
            : 'Crée un chapitre vide pour ranger une nouvelle ligne.'}
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex. Najdorf — Anglaise"
          autoFocus
          className="w-full rounded-md border border-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent-soft-border focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:text-ink"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="btn-accent rounded-btn px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Créer le chapitre
          </button>
        </div>
      </form>
    </Modal>
  );
}
