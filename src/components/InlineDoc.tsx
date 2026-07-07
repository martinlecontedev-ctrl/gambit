import type { ReactNode } from 'react';

/** Inline chips for documentation prose. Shared between the guide page and
 * its i18n dictionary (which cannot import the route module — cycle). */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-chip-border bg-chip px-1.5 py-0.5 text-[13px] font-semibold text-chip-text">
      {children}
    </kbd>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-chip-border bg-chip px-1.5 py-0.5 text-[13px] text-chip-text">
      {children}
    </code>
  );
}
