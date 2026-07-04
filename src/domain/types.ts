export type Color = 'white' | 'black';

export type Chapter = {
  id: string;
  name: string;
  /** Display order. Lower = earlier. */
  order: number;
  /** Custom starting FEN — only set on Lichess study chapters that use
   * `[FEN "…"]` + `[SetUp "1"]` headers. `undefined` means the chapter
   * starts from the standard initial position. Every Line in the chapter
   * has its `moves` indexed from this position. */
  startFen?: string;
};

export type Line = {
  id: string;
  name: string;
  /** Chapter the line belongs to. Migration guarantees this is set for every
   * line; lines whose data predates chapters get re-assigned to the opening's
   * default "Principal" chapter on read. */
  chapterId: string;
  /** Parent line in the variant tree (within the same chapter). `undefined`
   * means root of its chapter. */
  parentLineId?: string;
  /** UCI moves from the initial position. */
  moves: string[];
  /** Review windows over `moves`, as ply intervals each covering
   * `[start, end)` — `end` absent = open-ended, so moves appended later are
   * drilled without re-editing. A list because the segment editor (common
   * trunk vs branches) can produce non-contiguous coverage. Normalized on
   * write: sorted, merged, absent = whole line, `[]` = nothing drilled.
   * Cards outside every covering line's windows are not built (not due, not
   * counted in mastery) but their stored SRS stats survive a change. */
  reviewRanges?: { start: number; end?: number }[];
};

/**
 * PGN-style move judgement glyph. The number is the canonical NAG code.
 *   1 = !   good
 *   2 = ?   poor
 *   3 = !!  brilliant
 *   4 = ??  blunder
 *   5 = !?  interesting
 *   6 = ?!  dubious
 */
export type Nag = 1 | 2 | 3 | 4 | 5 | 6;

/** Chessground brush keys we accept for board overlays. */
export type ArrowBrush =
  | 'green'
  | 'red'
  | 'blue'
  | 'yellow'
  | 'paleGreen'
  | 'paleRed'
  | 'paleBlue'
  | 'paleGrey';

export type ArrowDef = {
  /** Origin square in algebraic notation (e.g. "e2"). */
  orig: string;
  /** Destination square; omit for a circle on `orig`. */
  dest?: string;
  brush: ArrowBrush;
};

export type Annotation = {
  /** Free-form note about the move that led to this position. */
  comment?: string;
  /** Judgement glyph attached to the move that led here. */
  nag?: Nag;
  /** Shapes drawn on the board for this position. */
  arrows?: ArrowDef[];
};

export type Opening = {
  id: string;
  name: string;
  /** Color the user plays. Board orientation follows this. Every chapter of
   * the opening shares this color. */
  color: Color;
  /** Always at least one chapter — migration on read creates a default
   * "Principal" chapter for openings that predate this field. */
  chapters: Chapter[];
  lines: Line[];
  /** Annotations keyed by the FEN of the position they describe. */
  annotations?: Record<string, Annotation>;
  /** Flat folder the opening lives in. `undefined` = root level. */
  folderId?: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * One logged review action. Append-only history (pruned by age) that backs the
 * exact "done today" count, and later the login streak and activity heatmap.
 * Every grade is logged — failures included — so consumers decide what counts.
 */
export type ReviewEvent = {
  /** When the grade was submitted (ms since epoch). */
  ts: number;
  /** The reviewed card's composite id. */
  cardId: string;
  openingId: string;
  /** SM-2 grade 0..5 submitted by the user. */
  grade: number;
};

/** Flat (non-nested) folder used to group openings on the home. */
export type Folder = {
  id: string;
  name: string;
  createdAt: number;
};

export type CardStats = {
  ease: number;
  /** Days. */
  interval: number;
  reps: number;
  /** Timestamp (ms since epoch). */
  due: number;
  lapses: number;
};

export type Card = CardStats & {
  /** Composite ID derived from `(openingId, chapterId, positionKey, expectedUci)`.
   * The chapter is part of the key so two chapters with the same position but
   * different expected user moves stay as separate SRS entries — that's what
   * lets the user learn divergent repertoire choices without contradictions. */
  id: string;
  openingId: string;
  chapterId: string;
  /** FEN of the position the user must respond to. */
  fen: string;
  /** UCI of the move the user must play in that position. */
  expectedUci: string;
  /** UCI of the move that led here — the opponent's last move. Highlighted on
   * the board during review so the user sees what was just played. Undefined
   * at a chapter's starting position. Display-only, recomputed on each build. */
  lastMove?: string;
};
