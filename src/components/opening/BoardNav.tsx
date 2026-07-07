/**
 * Cursor navigation bar shown under the board: start/prev buttons, a
 * scrubbable progress slider, next/end buttons and a ply counter.
 */
export function BoardNav({
  cursorIdx,
  total,
  onChange,
}: {
  cursorIdx: number;
  total: number;
  onChange: (idx: number) => void;
}) {
  const pct = total ? (cursorIdx / total) * 100 : 0;
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-resting">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(0)}
          className="whitespace-nowrap text-[13px] font-semibold text-ink-soft transition hover:text-ink"
        >
          Début
        </button>
        <button
          onClick={() => onChange(Math.max(0, cursorIdx - 1))}
          aria-label="Coup précédent"
          className="flex h-8 w-9 items-center justify-center rounded-lg border border-line-strong bg-field text-ink-soft transition hover:bg-track"
        >
          ←
        </button>
        <div className="relative flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-field shadow-resting"
            style={{ left: `${pct}%` }}
          />
          <input
            type="range"
            min={0}
            max={total}
            value={cursorIdx}
            onChange={e => onChange(Number(e.target.value))}
            disabled={total === 0}
            aria-label="Naviguer dans la ligne"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </div>
        <button
          onClick={() => onChange(Math.min(total, cursorIdx + 1))}
          aria-label="Coup suivant"
          className="flex h-8 w-9 items-center justify-center rounded-lg border border-line-strong bg-field text-ink-soft transition hover:bg-track"
        >
          →
        </button>
        <button
          onClick={() => onChange(total)}
          className="whitespace-nowrap text-[13px] font-semibold text-ink-soft transition hover:text-ink"
        >
          Fin
        </button>
        <span className="whitespace-nowrap pl-1 text-[12.5px] text-ink-muted tnum">
          {cursorIdx} / {total}
        </span>
      </div>
    </div>
  );
}
