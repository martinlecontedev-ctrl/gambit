import { useEffect, type ReactNode } from 'react';

/**
 * Minimal overlay dialog: backdrop click and Escape both close it. Inner
 * clicks don't bubble so the form below stays interactive. Match the rest of
 * the app's zinc-on-dark surface.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="text-zinc-500 transition hover:text-zinc-200"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
