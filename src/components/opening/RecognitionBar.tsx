import { useEffect, useState } from 'react';
import { recognizeOpening, type Opening as RecognizedOpening } from '../../domain/openings-db';
import type { Color } from '../../domain/types';

/**
 * ECO chip + recognized opening name for the position under the cursor,
 * with a YouTube search shortcut. Position-based, like lichess/chess.com:
 * we walk the current line up to the cursor and surface the deepest ECO
 * entry encountered. Position-keyed lookup means transpositions resolve to
 * the same name. Always rendered (`invisible` fallback) so its appearance
 * never shifts the board below.
 */
export function RecognitionBar({
  moves,
  cursorIdx,
  startFen,
  color,
}: {
  moves: string[] | undefined;
  cursorIdx: number;
  startFen: string;
  color: Color;
}) {
  const [recognized, setRecognized] = useState<RecognizedOpening | null>(null);
  useEffect(() => {
    if (!moves) {
      setRecognized(null);
      return;
    }
    let cancelled = false;
    recognizeOpening(moves, cursorIdx, startFen).then(found => {
      if (!cancelled) setRecognized(found);
    });
    return () => {
      cancelled = true;
    };
  }, [moves, cursorIdx, startFen]);

  return (
    <div className="flex items-center gap-2.5">
      <p
        className={`min-w-0 flex-1 truncate text-[13.5px] text-on-muted ${
          recognized ? '' : 'invisible'
        }`}
        aria-hidden={recognized ? undefined : true}
      >
        <span className="mr-2 rounded-md border border-ground-line bg-ground-overlay px-2 py-0.75 text-[11px] font-bold tracking-[0.06em] text-on-muted">
          {recognized?.eco ?? 'A00'}
        </span>
        <span className="italic text-on-body">{recognized?.name ?? ' '}</span>
      </p>
      <YoutubeSearchButton opening={recognized} color={color} />
    </div>
  );
}

/**
 * YouTube search shortcut shown next to the opening chip. When an opening is
 * recognized, opens a new tab with a curated search query; otherwise renders
 * a greyed-out placeholder of the same width so the chip row stays
 * layout-stable.
 */
function YoutubeSearchButton({
  opening,
  color,
}: {
  opening: RecognizedOpening | null;
  color: Color;
}) {
  const baseClass =
    'inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-chip-border bg-chip px-3 py-1 text-[13px] font-semibold transition';
  const icon = (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.376.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.546 15.568V8.432L15.818 12z" />
    </svg>
  );
  if (!opening) {
    return (
      <span
        className={`${baseClass} cursor-not-allowed text-on-idle`}
        aria-disabled="true"
        title="Pas d'ouverture reconnue"
      >
        {icon} YouTube
      </span>
    );
  }
  const query = `${opening.name} chess opening ${color}`;
  const href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${baseClass} text-danger hover:border-chip-hover`}
      title={`Rechercher "${query}" sur YouTube`}
    >
      {icon} YouTube
    </a>
  );
}
