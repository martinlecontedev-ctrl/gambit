const FIGURINES: Record<string, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
};

/**
 * Render a SAN string lichess-style: piece letters (K/Q/R/B/N) become chess
 * figurines, sized up since the Unicode glyphs render noticeably smaller than
 * the surrounding text. Files, pawns and castling are left as-is.
 *
 * Display-only — never feed a figurine string back to PGN/export/storage.
 */
export function FigurineSan({ san }: { san: string }) {
  // Split keeps the captured piece letters as separate array entries.
  const parts = san.split(/([KQRBN])/);
  return (
    <>
      {parts.map((p, i) =>
        FIGURINES[p] ? (
          <span
            key={i}
            className="inline-block text-[1.5em] leading-none"
          >
            {FIGURINES[p]}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
