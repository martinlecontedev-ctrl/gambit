export type Color = 'white' | 'black';

export type Line = {
  id: string;
  name: string;
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
  /** Composite ID: `${openingId}:${lineId}:${plyIdx}`. */
  id: string;
  openingId: string;
  lineId: string;
  /** Index of the move the user must produce. Position shown = moves[0..plyIdx). */
  plyIdx: number;
};
