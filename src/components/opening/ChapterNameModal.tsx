import { useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal';
import { useCommon } from '../../i18n/common';
import { useComponentStrings } from '../../i18n/components';

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
  const tr = useComponentStrings().chapterModal;
  const common = useCommon();
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
    <Modal open onClose={onCancel} title={tr.title}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-meta">
          {forced ? tr.forcedHelp : tr.emptyHelp}
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={tr.placeholder}
          autoFocus
          className="w-full rounded-md border border-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent-soft-border focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-chip-border bg-chip px-4 py-2 text-sm text-chip-text hover:border-chip-hover"
          >
            {common.cancel}
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="btn-accent rounded-btn px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tr.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}
