/**
 * Small switch controlling review opt-in (opening master switch on the home
 * cards, per-chapter switch on the overview). Stops propagation: it sits
 * inside clickable/draggable rows. The dot is laid out with flex (no
 * `position` on the button) so callers can position the switch themselves
 * via className (`absolute …` on the chapter rows).
 */
export function ReviewSwitch({
  on,
  onToggle,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      title={on ? 'Retirer de la révision' : 'Intégrer à la révision'}
      onClick={e => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-4.5 w-8 shrink-0 items-center rounded-full border px-0.5 transition-colors ${
        on ? 'justify-end border-transparent bg-accent' : 'justify-start border-line-strong bg-track'
      } ${className ?? ''}`}
    >
      <span className="h-3 w-3 rounded-full bg-white shadow-resting" />
    </button>
  );
}
