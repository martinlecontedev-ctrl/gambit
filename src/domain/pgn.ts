import type { Chess } from 'chessops/chess';
import { makeUci, parseUci, parseSquare, makeSquare } from 'chessops/util';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import {
  ChildNode,
  defaultGame,
  makeComment,
  makePgn,
  Node,
  parseComment,
  parsePgn,
  type CommentShape,
  type CommentShapeColor,
  type Game,
  type PgnNodeData,
} from 'chessops/pgn';
import { chessFromFen, fenOf, positionKey, START_FEN } from './chess';
import { commonPrefixLength, effectiveParentId } from './tree';
import type {
  Annotation,
  ArrowBrush,
  ArrowDef,
  Color,
  Line,
  Nag,
  Opening,
} from './types';

const brushToShapeColor: Record<ArrowBrush, CommentShapeColor | null> = {
  green: 'green',
  red: 'red',
  blue: 'blue',
  yellow: 'yellow',
  paleGreen: 'green',
  paleRed: 'red',
  paleBlue: 'blue',
  // Lichess has no "grey" shape, so we drop those on export.
  paleGrey: null,
};

const shapeColorToBrush: Record<CommentShapeColor, ArrowBrush> = {
  green: 'green',
  red: 'red',
  blue: 'blue',
  yellow: 'yellow',
};

/** Build a PGN string from a Gambit opening. Variations and annotations
 * (comments, NAGs, `[%cal ...]` arrows) are emitted in standard PGN format,
 * so the output round-trips through Lichess Study, ChessBase, etc. */
export function exportToPgn(opening: Opening): string {
  const rootLine = opening.lines.find(l => !effectiveParentId(opening.lines, l));
  if (!rootLine) return '';

  const game = defaultGame<PgnNodeData>();
  game.headers.set('Event', opening.name);
  game.headers.set('White', opening.color === 'white' ? 'Gambit' : '?');
  game.headers.set('Black', opening.color === 'black' ? 'Gambit' : '?');
  game.headers.set('Result', '*');

  emitLine(opening, rootLine, 0, chessFromFen(START_FEN), game.moves);

  return makePgn(game);
}

function emitLine(
  opening: Opening,
  line: Line,
  fromPosition: number,
  chess: Chess,
  parentPgnNode: Node<PgnNodeData>,
): void {
  let currentParent = parentPgnNode;
  for (let i = fromPosition; i < line.moves.length; i++) {
    const uci = line.moves[i];
    const move = parseUci(uci);
    if (!move) break;

    // Snapshot the position before playing the main move so variants can
    // branch off from the same point.
    const preMove = chess.clone();
    const san = makeSanAndPlay(chess, move);
    const data = buildPgnData(opening, san, fenOf(chess));
    const mainNode = new ChildNode(data);
    currentParent.children.push(mainNode);

    // Direct child variants of `line` that diverge exactly here (their first
    // own move is at position i) are emitted as siblings of `mainNode`.
    const variants = opening.lines.filter(
      v =>
        effectiveParentId(opening.lines, v) === line.id &&
        commonPrefixLength(v.moves, line.moves) === i,
    );
    for (const variant of variants) {
      emitLine(opening, variant, i, preMove.clone(), currentParent);
    }

    currentParent = mainNode;
  }
}

function buildPgnData(
  opening: Opening,
  san: string,
  fenAfter: string,
): PgnNodeData {
  const data: PgnNodeData = { san };
  const ann = opening.annotations?.[positionKey(fenAfter)];
  if (!ann) return data;
  if (ann.nag !== undefined) data.nags = [ann.nag];
  const text = ann.comment?.trim() ?? '';
  const shapes: CommentShape[] = (ann.arrows ?? [])
    .map(a => {
      const color = brushToShapeColor[a.brush];
      const from = parseSquare(a.orig);
      const to = parseSquare(a.dest ?? a.orig);
      if (color === null || from === undefined || to === undefined) return null;
      return { color, from, to } satisfies CommentShape;
    })
    .filter((s): s is CommentShape => s !== null);
  if (text || shapes.length > 0) {
    data.comments = [makeComment({ text, shapes })];
  }
  return data;
}

export type ImportResult = {
  opening: Opening;
  /** Group name read from `[Event "Group: Chapter"]`. Useful as the default
   * folder name when bulk-importing a Lichess study. `undefined` when the
   * Event header has no colon. */
  studyName?: string;
};

/** Parse a PGN string and produce one Opening per game found. Comments are
 * read with chessops' standard parser so `[%cal ...]` arrows and NAGs come
 * along for the ride. */
export function importFromPgn(pgn: string, color: Color): ImportResult[] {
  const games = parsePgn(pgn);
  return games.map((g, i) => gameToOpening(g, color, i));
}

function gameToOpening(
  game: Game<PgnNodeData>,
  color: Color,
  index: number,
): ImportResult {
  const { name, studyName } = openingNameFromHeaders(
    game.headers,
    `Importé ${index + 1}`,
  );
  const now = Date.now();
  const opening: Opening = {
    id: crypto.randomUUID(),
    name,
    color,
    lines: [],
    annotations: {},
    createdAt: now,
    updatedAt: now,
  };
  const rootLine: Line = {
    id: crypto.randomUUID(),
    name: 'Ligne 1',
    moves: [],
    parentLineId: undefined,
  };
  opening.lines.push(rootLine);

  processChildren(game.moves, rootLine, chessFromFen(START_FEN), opening);

  return { opening, studyName };
}

function processChildren(
  node: Node<PgnNodeData>,
  line: Line,
  chess: Chess,
  opening: Opening,
): void {
  if (node.children.length === 0) return;
  const main = node.children[0];
  const variants = node.children.slice(1);

  // Spawn variant lines BEFORE playing the mainline move so each variant
  // sees the pre-move position.
  for (const variant of variants) {
    const variantLine: Line = {
      id: crypto.randomUUID(),
      name: 'Variante',
      moves: [...line.moves],
      parentLineId: line.id,
    };
    opening.lines.push(variantLine);
    processChildNode(variant, variantLine, chess.clone(), opening);
  }

  processChildNode(main, line, chess, opening);
}

function processChildNode(
  child: ChildNode<PgnNodeData>,
  line: Line,
  chess: Chess,
  opening: Opening,
): void {
  const move = parseSan(chess, child.data.san);
  // Skip silently if the SAN can't be played against the current position —
  // chessops' Position.play already enforces legality on the moves we keep.
  if (!move) return;
  const uci = makeUci(move);
  line.moves.push(uci);
  chess.play(move);
  applyAnnotation(opening, child.data, fenOf(chess));
  processChildren(child, line, chess, opening);
}

function applyAnnotation(
  opening: Opening,
  data: PgnNodeData,
  fenAfter: string,
): void {
  const nagRaw = data.nags?.[0];
  const nag: Nag | undefined =
    nagRaw === 1 || nagRaw === 2 || nagRaw === 3 || nagRaw === 4 || nagRaw === 5 || nagRaw === 6
      ? (nagRaw as Nag)
      : undefined;

  let text = '';
  const shapes: CommentShape[] = [];
  for (const raw of data.comments ?? []) {
    const c = parseComment(raw);
    if (c.text) text = text ? `${text} ${c.text}` : c.text;
    for (const s of c.shapes) shapes.push(s);
  }
  const arrows: ArrowDef[] = shapes.map(s => ({
    orig: makeSquare(s.from),
    dest: makeSquare(s.to),
    brush: shapeColorToBrush[s.color],
  }));

  if (nag === undefined && !text.trim() && arrows.length === 0) return;

  const key = positionKey(fenAfter);
  if (!opening.annotations) opening.annotations = {};
  const existing = opening.annotations[key] ?? {};
  const merged: Annotation = { ...existing };
  if (nag !== undefined) merged.nag = nag;
  if (text.trim()) merged.comment = text.trim();
  if (arrows.length > 0) merged.arrows = arrows;
  opening.annotations[key] = merged;
}

function openingNameFromHeaders(
  headers: Map<string, string>,
  fallback: string,
): { name: string; studyName?: string } {
  const event = headers.get('Event');
  if (event) {
    // Lichess Study chapters serialize as `[Event "Study: Chapter"]`.
    const colon = event.indexOf(':');
    if (colon > -1) {
      const studyName = event.slice(0, colon).trim() || undefined;
      const chapter = event.slice(colon + 1).trim();
      return { name: chapter || event, studyName };
    }
    return { name: event };
  }
  const white = headers.get('White');
  const black = headers.get('Black');
  if (white && black && white !== '?' && black !== '?') {
    return { name: `${white} vs ${black}` };
  }
  return { name: fallback };
}

/** Fetch a Lichess Study (or a single chapter) and return the raw PGN.
 * Accepts the full URL `https://lichess.org/study/STUDYID[/CHAPTERID]` or a
 * raw 8-char study id. */
export async function fetchLichessStudy(input: string): Promise<string> {
  const trimmed = input.trim();
  const m = trimmed.match(/study\/([a-zA-Z0-9]{8})(?:\/([a-zA-Z0-9]{8}))?/);
  let studyId: string | undefined;
  let chapterId: string | undefined;
  if (m) {
    studyId = m[1];
    chapterId = m[2];
  } else if (/^[a-zA-Z0-9]{8}$/.test(trimmed)) {
    studyId = trimmed;
  } else {
    throw new Error('URL Lichess Study invalide');
  }
  const url = chapterId
    ? `https://lichess.org/api/study/${studyId}/${chapterId}.pgn`
    : `https://lichess.org/api/study/${studyId}.pgn`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Lichess a renvoyé ${res.status}`);
  return await res.text();
}

