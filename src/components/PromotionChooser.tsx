import { createElement } from 'react';
import type { Key } from '@lichess-org/chessground/types';
import type { PromotionRole } from '../domain/chess';
import type { Color } from '../domain/types';
import { useCommon } from '../i18n/common';

const CHOICES: { role: PromotionRole; piece: string }[] = [
  { role: 'q', piece: 'queen' },
  { role: 'n', piece: 'knight' },
  { role: 'r', piece: 'rook' },
  { role: 'b', piece: 'bishop' },
];

/**
 * Lichess-style promotion picker: a scrim over the board and one choice per
 * square down the destination file (queen nearest the promotion rank).
 * Rendered inside the board's `relative` wrapper. The root carries the
 * `cg-wrap` class ONLY so the cburnett sprite selectors (`.cg-wrap
 * piece.white.queen`) style the <piece> elements — all layout-critical
 * properties are inline because chessground's stylesheet is unlayered and
 * would beat Tailwind utilities.
 */
export function PromotionChooser({
  dest,
  color,
  orientation,
  onPick,
  onCancel,
}: {
  dest: Key;
  /** Side that promotes (the pawn's color). */
  color: Color;
  orientation: Color;
  onPick: (role: PromotionRole) => void;
  onCancel: () => void;
}) {
  const tr = useCommon();
  const file = dest.charCodeAt(0) - 97;
  const col = orientation === 'white' ? file : 7 - file;
  // Choices stack from the promotion square inward: top-down when the pawn
  // promotes on the top edge of the current orientation, bottom-up otherwise.
  const fromTop = orientation === 'white' ? dest[1] === '8' : dest[1] === '1';
  return (
    <div
      className="cg-wrap"
      style={{ position: 'absolute', inset: 0, zIndex: 20, width: '100%', height: '100%' }}
    >
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, background: 'rgba(15, 22, 16, 0.4)' }}
      />
      {CHOICES.map((c, i) => (
        <button
          key={c.role}
          onClick={() => onPick(c.role)}
          title={tr.promotion.pieces[c.role]}
          aria-label={tr.promotion.promoteTo(tr.promotion.pieces[c.role])}
          className="flex items-center justify-center rounded-full border border-line-strong bg-surface shadow-card transition hover:border-accent"
          style={{
            position: 'absolute',
            width: '12.5%',
            height: '12.5%',
            left: `${col * 12.5}%`,
            top: `${(fromTop ? i : 7 - i) * 12.5}%`,
          }}
        >
          {createElement('piece', {
            className: `${color} ${c.piece}`,
            style: {
              position: 'static',
              display: 'block',
              width: '84%',
              height: '84%',
              pointerEvents: 'none',
            },
          })}
        </button>
      ))}
    </div>
  );
}
