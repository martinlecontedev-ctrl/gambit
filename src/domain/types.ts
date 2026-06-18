export type Color = 'white' | 'black';

export type Line = {
  id: string;
  name: string;
  /** Parent line in the variant tree. `undefined` means root. */
  parentLineId?: string;
  /** UCI moves from the initial position. */
  moves: string[];
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
  /** Color the user plays. Board orientation follows this. */
  color: Color;
  lines: Line[];
  /** Annotations keyed by the FEN of the position they describe. */
  annotations?: Record<string, Annotation>;
  /** Flat folder the opening lives in. `undefined` = root level. */
  folderId?: string;
  createdAt: number;
  updatedAt: number;
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
  /** Composite ID derived from `(openingId, fen, expectedUci)`. */
  id: string;
  openingId: string;
  /** FEN of the position the user must respond to. */
  fen: string;
  /** UCI of the move the user must play in that position. */
  expectedUci: string;
};
