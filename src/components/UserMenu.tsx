import { useEffect, useState } from 'react';
import { THEMES, setTheme, useTheme } from '../domain/theme';

/**
 * User button in the header + preferences panel. The panel is a floating
 * CARD (surface family) even though the button lives on the header/ground —
 * it will grow more sections over time; for now: theme choice.
 */
export function UserMenu() {
  const [open, setOpen] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Préférences"
        aria-expanded={open}
        className={`flex h-8.5 w-8.5 items-center justify-center rounded-full border transition-colors ${
          open
            ? 'border-accent-ground text-on-ink'
            : 'border-ground-line bg-ground-overlay text-on-muted hover:text-on-ink'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="8" r="4" fill="currentColor" />
          <path d="M4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-72 rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-3 text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
              Thème
            </div>
            <div className="flex flex-col gap-1.5">
              {THEMES.map(t => {
                const active = t.id === theme;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`flex items-center gap-3 rounded-btn border p-2 text-left transition-colors ${
                      active
                        ? 'border-accent-soft-border bg-accent-soft'
                        : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <span
                      className="relative h-8 w-12 shrink-0 overflow-hidden rounded-md"
                      style={{ background: t.preview.ground, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.14)' }}
                    >
                      <span
                        className="absolute top-1.5 left-1.5 h-5 w-6 rounded-[3px]"
                        style={{ background: t.preview.surface, boxShadow: '0 0 0 1px rgba(0,0,0,.08)' }}
                      />
                      <span
                        className="absolute top-1.5 right-1.5 h-2 w-2 rounded-[2px]"
                        style={{ background: t.preview.board }}
                      />
                      <span
                        className="absolute right-1.5 bottom-1.5 h-2 w-2 rounded-full"
                        style={{ background: t.preview.accent }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] font-semibold ${active ? 'text-accent-soft-text' : 'text-ink'}`}>
                        {t.label}
                      </span>
                      <span className={`block text-[11.5px] ${active ? 'text-accent-soft-text/80' : 'text-meta'}`}>
                        {t.hint}
                      </span>
                    </span>
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-accent-soft-text">
                        <path d="M4.5 12.5l5 5 10-11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
