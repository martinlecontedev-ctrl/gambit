import { Fragment, useMemo } from 'react';
import { FigurineSan } from '../FigurineSan';
import { chessFromFen, sameMove, turnColor, uciToSanAt } from '../../domain/chess';
import { NAG_COLORS, NAG_LABELS, NAG_SYMBOLS } from '../../domain/nag';
import { buildPrefixTrie, continuationsAt } from '../../domain/tree';
import type { Line, Nag } from '../../domain/types';

type TrieRoot = ReturnType<typeof buildPrefixTrie>;

type SelectedLineProps = {
  line: Line;
  sans: string[];
  fenAtPosition: Map<number, string>;
  trie: TrieRoot;
  cursorIdx: number;
  nagsAlongLine: Map<number, Nag>;
  /** Starting FEN for the chapter the selected line belongs to. Drives the
   * move numbers and the white/black column assignment when a chapter
   * starts past the initial position. */
  startFen: string;
  onSetCursor: (pos: number) => void;
  onSwitchLine: (lineId: string, pos: number) => void;
};

/**
 * Renders the selected line as a scoresheet-style table: one row per move
 * pair (number · white cell · black cell). Each cell holds the played move
 * and any sibling continuations seen at that ply as italic paren-chips.
 * Clicking a chip switches the selected line to one that takes that
 * continuation, landing the cursor on the alternative move.
 */
export function SelectedLineView({
  line,
  sans,
  fenAtPosition,
  trie,
  cursorIdx,
  nagsAlongLine,
  startFen,
  onSetCursor,
  onSwitchLine,
}: SelectedLineProps) {
  // Read the starting fullmove number and side-to-move from the chapter's
  // starting FEN. A chapter that begins after `3.d4` (black to move at
  // fullmove 3) needs to label its first move "3..." and reserve an empty
  // white cell on the first row.
  const startMeta = useMemo(() => {
    const c = chessFromFen(startFen);
    return {
      fullmove: c.fullmoves,
      startsBlack: turnColor(c) === 'black',
    };
  }, [startFen]);

  if (line.moves.length === 0) {
    return (
      <div className="py-3 text-sm">
        <button
          onClick={() => onSetCursor(0)}
          className={`rounded-md px-2 py-1 text-xs italic transition ${
            cursorIdx === 0
              ? 'border border-line-strong bg-surface-high text-ink shadow-resting'
              : 'text-meta hover:bg-track'
          }`}
        >
          (position initiale — jouez un coup)
        </button>
      </div>
    );
  }

  const offset = startMeta.startsBlack ? 1 : 0;
  const tailPos = line.moves.length;
  const trailing = continuationsAt(trie, line, tailPos);
  const totalRows = Math.ceil((line.moves.length + offset) / 2);
  // The next move would be white when the count of slots so far (offset +
  // plies) is even — that's when we need a fresh row to host a trailing
  // white chip from an alternative continuation.
  const nextSideIsWhite = (line.moves.length + offset) % 2 === 0;
  const needsTrailingRow = trailing.length > 0 && nextSideIsWhite;
  const rowsToRender = totalRows + (needsTrailingRow ? 1 : 0);

  const rows: React.ReactNode[] = [];
  for (let rowIdx = 0; rowIdx < rowsToRender; rowIdx++) {
    const fullmove = startMeta.fullmove + rowIdx;
    // `whitePly` is `-1` for the first row when the chapter starts on
    // black's move — we render an empty placeholder cell so the column
    // grid stays aligned with the number column.
    const whitePly = rowIdx * 2 - offset;
    const blackPly = whitePly + 1;
    const isEven = rowIdx % 2 === 0;

    rows.push(
      <Fragment key={rowIdx}>
        <div
          className={`select-none px-3 py-1.5 text-right text-ink-muted tnum ${
            isEven ? 'bg-field' : ''
          }`}
        >
          {fullmove}.
        </div>
        {whitePly >= 0 ? (
          <MoveCell
            line={line}
            sans={sans}
            pos={whitePly}
            tailPos={tailPos}
            trie={trie}
            trailing={trailing}
            fenAtPosition={fenAtPosition}
            cursorIdx={cursorIdx}
            nag={nagsAlongLine.get(whitePly)}
            onSetCursor={onSetCursor}
            onSwitchLine={onSwitchLine}
            shaded={isEven}
          />
        ) : (
          <div
            className={`border-l border-line px-3 py-1.5 ${
              isEven ? 'bg-field' : ''
            }`}
          />
        )}
        <MoveCell
          line={line}
          sans={sans}
          pos={blackPly}
          tailPos={tailPos}
          trie={trie}
          trailing={trailing}
          fenAtPosition={fenAtPosition}
          cursorIdx={cursorIdx}
          nag={nagsAlongLine.get(blackPly)}
          onSetCursor={onSetCursor}
          onSwitchLine={onSwitchLine}
          shaded={isEven}
        />
      </Fragment>,
    );
  }

  return (
    <div className="grid grid-cols-[34px_1fr_1fr] overflow-hidden pb-2 text-sm">
      {rows}
    </div>
  );
}

type MoveCellProps = {
  line: Line;
  sans: string[];
  pos: number;
  tailPos: number;
  trie: TrieRoot;
  trailing: { uci: string; lineIds: string[] }[];
  fenAtPosition: Map<number, string>;
  cursorIdx: number;
  nag: Nag | undefined;
  onSetCursor: (pos: number) => void;
  onSwitchLine: (lineId: string, pos: number) => void;
  shaded: boolean;
};

function MoveCell({
  line,
  sans,
  pos,
  tailPos,
  trie,
  trailing,
  fenAtPosition,
  cursorIdx,
  nag,
  onSetCursor,
  onSwitchLine,
  shaded,
}: MoveCellProps) {
  const hasMove = pos < line.moves.length;
  const isTail = pos === tailPos;
  const fen = fenAtPosition.get(pos);
  let alts: { uci: string; lineIds: string[] }[];
  if (hasMove && fen) {
    // sameMove, not ===: a legacy line may spell the same castle e1h1 where
    // this one says e1g1 — a raw comparison would chip the played move.
    const chess = chessFromFen(fen);
    alts = continuationsAt(trie, line, pos).filter(
      c => !sameMove(chess, c.uci, line.moves[pos]),
    );
  } else {
    alts = isTail ? trailing : [];
  }

  return (
    <div
      className={`border-l border-line px-3 py-1.5 ${shaded ? 'bg-field' : ''}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        {hasMove && (
          <span className="inline-flex items-baseline gap-0.5">
            <SelectedMove
              san={sans[pos] ?? line.moves[pos]}
              isCursor={cursorIdx === pos + 1}
              onClick={() => onSetCursor(pos + 1)}
            />
            {nag !== undefined && (
              <span
                className={`text-xs font-bold leading-none ${NAG_COLORS[nag]}`}
                title={NAG_LABELS[nag]}
              >
                {NAG_SYMBOLS[nag]}
              </span>
            )}
          </span>
        )}
        {fen &&
          alts.map(alt => (
            <AltChip
              key={alt.uci}
              san={uciToSanAt(fen, alt.uci)}
              onClick={() => onSwitchLine(alt.lineIds[0], pos + 1)}
            />
          ))}
      </div>
    </div>
  );
}

function SelectedMove({
  san,
  isCursor,
  onClick,
}: {
  san: string;
  isCursor: boolean;
  onClick: () => void;
}) {
  // The white/black distinction is now carried by the column the cell sits
  // in, so the move itself can stay uniform — only the cursor needs to pop.
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-1.5 py-0.5 font-semibold transition ${
        isCursor
          ? 'border border-line-strong bg-surface-high text-ink shadow-resting'
          : 'text-ink hover:bg-track'
      }`}
    >
      <FigurineSan san={san} />
    </button>
  );
}

function AltChip({
  san,
  onClick,
}: {
  san: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`Basculer sur la variante ${san}`}
      className="cursor-pointer italic text-ink-muted transition hover:text-ink"
    >
      (<FigurineSan san={san} />)
    </button>
  );
}
