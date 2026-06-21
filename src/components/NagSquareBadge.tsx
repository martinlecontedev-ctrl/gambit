import { NAG_BADGE_BG, NAG_LABELS, NAG_SYMBOLS } from '../domain/nag';
import type { Color, Nag } from '../domain/types';

/**
 * Floating pill rendered on top of a single board square, anchored in the
 * top-right corner. Used to flag the move that just landed on that square
 * with its judgement glyph (e.g. !!, ??, !?). Caller is responsible for
 * making the parent `position: relative` and sized like the board.
 */
export function NagSquareBadge({
  nag,
  square,
  orientation,
}: {
  nag: Nag;
  /** Algebraic square name (e.g. "e4"). */
  square: string;
  /** Which side is at the bottom of the board. */
  orientation: Color;
}) {
  if (square.length < 2) return null;
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(square[1], 10) - 1;
  if (file < 0 || file > 7 || isNaN(rank) || rank < 0 || rank > 7) return null;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  return (
    <div
      // High z-index puts the pill above chessground's pieces, which sit on
      // their own stacking context — without this, the move's destination
      // piece always covers the judgement glyph.
      className="pointer-events-none absolute z-30"
      style={{
        left: `${col * 12.5}%`,
        top: `${row * 12.5}%`,
        width: '12.5%',
        height: '12.5%',
      }}
    >
      <span
        className={`absolute right-1 top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 font-mono text-[11px] font-bold leading-none text-zinc-900 shadow-md ${NAG_BADGE_BG[nag]}`}
        title={NAG_LABELS[nag]}
      >
        {NAG_SYMBOLS[nag]}
      </span>
    </div>
  );
}
