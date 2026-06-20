#!/usr/bin/env node
// Reads the vendored lichess-org/chess-openings TSVs and produces a compact
// position → { eco, name } map keyed by the canonical position key (the
// first 4 FEN fields), which matches `src/domain/chess.ts:positionKey`.
//
// Re-run this whenever you refresh the vendored TSVs:
//   node scripts/build-openings-index.mjs

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chessops/chess';
import { parseFen, INITIAL_FEN, makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsvDir = join(root, 'src/data/eco');
const outFile = join(root, 'src/data/openings-index.json');

/** SAN tokens for one PGN move-text. Strips move numbers / annotations. */
function sanTokens(pgn) {
  return pgn
    .replace(/\{[^}]*\}/g, ' ')           // comments
    .replace(/\([^()]*\)/g, ' ')          // variations (none here, but safe)
    .replace(/\$\d+/g, ' ')               // NAGs
    .replace(/\d+\.(\.\.)?/g, ' ')        // move numbers (incl. "12...")
    .replace(/[!?]+/g, ' ')               // !? !! ?? glyphs
    .split(/\s+/)
    .filter(t => t.length > 0 && !/^[10½*-]+$/.test(t)); // drop result tokens
}

/** First 4 fields of a FEN, matching `positionKey` on the client. */
function positionKey(fen) {
  return fen.split(' ', 4).join(' ');
}

const index = {};
let totalRows = 0;
let parsed = 0;
let failed = 0;

const tsvFiles = readdirSync(tsvDir)
  .filter(f => f.endsWith('.tsv'))
  .sort();

for (const file of tsvFiles) {
  const content = readFileSync(join(tsvDir, file), 'utf8');
  const lines = content.split('\n');
  // First line is the header.
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    totalRows++;
    const [eco, name, pgn] = row.split('\t');
    if (!eco || !name || !pgn) continue;

    const setup = parseFen(INITIAL_FEN).unwrap();
    const chess = Chess.fromSetup(setup).unwrap();
    let ok = true;
    for (const san of sanTokens(pgn)) {
      const move = parseSan(chess, san);
      if (!move) {
        ok = false;
        break;
      }
      chess.play(move);
    }
    if (!ok) {
      failed++;
      console.warn(`Skip ${eco} "${name}": invalid SAN in "${pgn}"`);
      continue;
    }

    const key = positionKey(makeFen(chess.toSetup()));
    // Later, more specific entries (longer PGN landing at a deeper position)
    // overwrite earlier ones at the same key. Lichess's own behaviour is the
    // same: the dataset is curated to avoid name collisions at a position.
    index[key] = { eco, name };
    parsed++;
  }
}

writeFileSync(outFile, JSON.stringify(index));

const bytes = JSON.stringify(index).length;
console.log(
  `${parsed}/${totalRows} rows indexed (${failed} skipped). ` +
    `${Object.keys(index).length} unique positions. ` +
    `${(bytes / 1024).toFixed(1)} KB written to ${outFile.replace(root + '/', '')}.`,
);
