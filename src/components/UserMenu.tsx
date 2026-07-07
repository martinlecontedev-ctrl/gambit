import { useEffect, useRef, useState } from 'react';
import { backupSummary, buildBackup, parseBackup } from '../domain/backup';
import { THEMES, setTheme, useTheme } from '../domain/theme';
import { restoreAll, snapshotAll } from '../storage/repository';

/**
 * User button in the header + preferences panel. The panel is a floating
 * CARD (surface family) even though the button lives on the header/ground —
 * it will grow more sections over time; for now: theme choice + backup.
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
          <div className="absolute right-0 top-11 z-50 w-72 rounded-card border border-line bg-surface p-4 text-ink shadow-card">
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
                        className="absolute top-1.5 right-1.5 h-2 w-2 rounded-xs"
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

            <BackupSection />
          </div>
        </>
      )}
    </div>
  );
}

/** Export/restore of the FULL local state (repertoires + SRS progress +
 * history) — the PGN export loses all of that. Restore replaces everything. */
function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const onExport = () => {
    const backup = buildBackup(snapshotAll(), Date.now());
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gambit-sauvegarde-${backup.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg({ kind: 'ok', text: `Exporté : ${backupSummary(backup)}.` });
  };

  const onRestoreFile = async (file: File) => {
    const res = parseBackup(await file.text());
    if (!res.ok) {
      setMsg({ kind: 'err', text: res.error });
      return;
    }
    const exportedOn = res.backup.exportedAt
      ? new Date(res.backup.exportedAt).toLocaleDateString('fr-FR')
      : 'date inconnue';
    const confirmed = window.confirm(
      `Restaurer cette sauvegarde ?\n\n` +
        `Fichier (${exportedOn}) : ${backupSummary(res.backup)}\n` +
        `Actuellement : ${backupSummary(snapshotAll())}\n\n` +
        `Toutes les données actuelles seront REMPLACÉES.`,
    );
    if (!confirmed) return;
    restoreAll(res.backup);
    setMsg({ kind: 'ok', text: 'Sauvegarde restaurée.' });
  };

  return (
    <>
      <div className="mt-4 mb-2 text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">
        Données
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={onExport}
          className="flex-1 rounded-btn border border-chip-border bg-chip px-2 py-1.5 text-[12.5px] font-semibold text-chip-text transition hover:border-chip-hover"
        >
          Exporter
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-1 rounded-btn border border-chip-border bg-chip px-2 py-1.5 text-[12.5px] font-semibold text-chip-text transition hover:border-chip-hover"
        >
          Restaurer…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            // Reset so picking the same file twice re-triggers onChange.
            e.target.value = '';
            if (file) void onRestoreFile(file);
          }}
        />
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-meta">
        Fichier complet : répertoires, progrès de révision, historique,
        dossiers. Le compte Lichess et les réglages locaux ne sont pas inclus.
      </p>
      {msg && (
        <p
          className={`mt-1.5 text-[11.5px] font-semibold ${
            msg.kind === 'ok' ? 'text-success' : 'text-danger'
          }`}
        >
          {msg.text}
        </p>
      )}
    </>
  );
}
