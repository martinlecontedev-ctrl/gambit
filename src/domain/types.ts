export type Color = 'white' | 'black';

export type Line = {
  id: string;
  name: string;
  /** Parent line in the variant tree. `undefined` means root. */
  parentLineId?: string;
  /** UCI moves from the initial position. */
  moves: string[];
};

export type Opening = {
  id: string;
  name: string;
  /** Color the user plays. Board orientation follows this. */
  color: Color;
  lines: Line[];
  createdAt: number;
  updatedAt: number;
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
