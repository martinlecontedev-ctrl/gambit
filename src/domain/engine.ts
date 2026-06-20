// Minimal Stockfish.js wrapper. One Worker (singleton), one search at a time.
//
// UCI protocol contract we rely on:
//   - `uci`        → engine eventually replies `uciok` (after option lines).
//   - `isready`    → engine replies `readyok`.
//   - `position …` → updates the engine's internal board for the next `go`.
//   - `go …`       → engine emits `info …` lines, eventually exactly one `bestmove …`.
//   - `stop`       → engine wraps up the current search and emits `bestmove`.
//
// stockfish.js implementation detail (verified by reading the wrapper in
// node_modules/stockfish/bin/stockfish-18-lite-single.js): `go` and
// `setoption` are queued in the worker until the engine is idle, while
// `position` and `stop` are dispatched immediately. Sending `position` +
// `go` while a previous search is still running confuses the engine, so we
// serialize via a Promise mutex: each analyze() awaits the previous one's
// bestmove to arrive before issuing its own commands. Callers that don't
// want every queued analyze to actually run (e.g. rapid navigation) should
// add their own skip-stale check around analyze() — the engine just runs
// what it's given.

const ENGINE_URL = '/engine/stockfish-18-lite-single.js';
const WATCHDOG_MS = 5000;
const DEBUG = false;

const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[engine]', ...args);
};

export type EngineLine = {
  uci: string;
  pv: string[];
  cp?: number;
  mate?: number;
  depth: number;
};

export type EngineResult = {
  fen: string;
  depth: number;
  lines: EngineLine[];
};

export type AnalyzeOpts = {
  multiPv?: number;
  depth?: number;
  movetimeMs?: number;
};

// --- Worker singleton & boot ------------------------------------------------

let worker: Worker | null = null;
let ready = false;
let bootPromise: Promise<void> | null = null;
let bootResolve: (() => void) | null = null;
let bootReject: ((err: unknown) => void) | null = null;

// --- Current search state ---------------------------------------------------

type Search = {
  fen: string;
  multiPv: number;
  lines: EngineLine[];
  depth: number;
  /** Resolve the engine.analyze() promise. */
  resolve: (r: EngineResult) => void;
  watchdog: ReturnType<typeof setTimeout>;
};

/** The search the engine is currently working on (we own the result). */
let current: Search | null = null;

/** Mutex chain: each analyze waits for the previous one to fully release. */
let mutex: Promise<void> = Promise.resolve();

// --- Boot -------------------------------------------------------------------

function ensureWorker(): Promise<void> {
  if (ready) return Promise.resolve();
  if (bootPromise) return bootPromise;

  log('boot: creating Worker');
  worker = new Worker(ENGINE_URL);
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);

  bootPromise = new Promise<void>((resolve, reject) => {
    bootResolve = resolve;
    bootReject = reject;
    worker!.postMessage('uci');
  });
  return bootPromise;
}

function onError(e: ErrorEvent): void {
  console.error('[engine] worker error:', e.message || e.error);
  hardReset(e.error ?? new Error('worker error'));
}

function hardReset(reason?: unknown): void {
  log('hardReset', reason);
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* ignored */
    }
    worker = null;
  }
  const wasReady = ready;
  ready = false;
  bootPromise = null;
  // Resolve any in-flight search so its caller's await unblocks. The
  // wrapped resolve also releases this analyze's mutex slot, so a queued
  // analyze can proceed.
  if (current) {
    const c = current;
    current = null;
    clearTimeout(c.watchdog);
    c.resolve({ fen: c.fen, depth: 0, lines: [] });
  }
  // Reject boot if we never got readyok.
  if (!wasReady && bootReject) {
    bootReject(reason ?? new Error('boot aborted'));
  }
  bootResolve = null;
  bootReject = null;
}

// --- Message handling -------------------------------------------------------

function onMessage(e: MessageEvent): void {
  const line = String(e.data);
  if (DEBUG && line.length < 200) log('<<', line);

  if (!ready) {
    if (line === 'uciok') {
      worker?.postMessage('isready');
    } else if (line === 'readyok') {
      log('boot: ready');
      ready = true;
      bootResolve?.();
      bootResolve = null;
      bootReject = null;
    }
    return;
  }

  if (line.startsWith('info')) {
    if (current) parseInfoInto(line, current);
    return;
  }

  if (line.startsWith('bestmove')) {
    log('bestmove received');
    if (current) {
      const c = current;
      current = null;
      clearTimeout(c.watchdog);
      c.resolve({
        fen: c.fen,
        depth: c.depth,
        lines: c.lines.filter(Boolean).slice(0, c.multiPv),
      });
    }
  }
}

function parseInfoInto(line: string, s: Search): void {
  const tokens = line.split(' ');
  let multipv = 1;
  let cp: number | undefined;
  let mate: number | undefined;
  let depth = s.depth;
  let pvStart = -1;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case 'depth':
        depth = parseInt(tokens[i + 1], 10);
        i++;
        break;
      case 'multipv':
        multipv = parseInt(tokens[i + 1], 10);
        i++;
        break;
      case 'score': {
        const kind = tokens[i + 1];
        const val = parseInt(tokens[i + 2], 10);
        if (kind === 'cp') cp = val;
        else if (kind === 'mate') mate = val;
        i += 2;
        break;
      }
      case 'pv':
        pvStart = i + 1;
        break;
    }
    if (pvStart >= 0) break;
  }
  if (pvStart < 0) return;
  const pv = tokens.slice(pvStart);
  if (pv.length === 0) return;
  s.lines[multipv - 1] = { uci: pv[0], pv, cp, mate, depth };
  s.depth = depth;
}

// --- Public API -------------------------------------------------------------

export const engine = {
  async analyze(fen: string, opts: AnalyzeOpts = {}): Promise<EngineResult> {
    // Take a mutex slot upfront. Each analyze waits for the previous one's
    // bestmove to land (or for hardReset to release it) before sending its
    // own commands — that's why we don't need outstanding-bestmove counting.
    const previous = mutex;
    let release: () => void = () => {};
    mutex = new Promise<void>(r => {
      release = r;
    });
    await previous;

    // Re-ensure the Worker after taking the slot. A previous hardReset (e.g.
    // engine.stop() while we were queued, or a watchdog firing) could have
    // torn it down — in that case we boot a fresh one transparently.
    await ensureWorker();

    const multiPv = opts.multiPv ?? 3;
    const depth = opts.depth ?? 18;
    const movetimeMs = opts.movetimeMs ?? 500;

    return new Promise<EngineResult>(resolve => {
      const search: Search = {
        fen,
        multiPv,
        lines: [],
        depth: 0,
        resolve: result => {
          release();
          resolve(result);
        },
        watchdog: setTimeout(() => {
          if (current !== search) return;
          console.warn('[engine] watchdog: no bestmove after', WATCHDOG_MS, 'ms — resetting');
          current = null;
          search.resolve({
            fen: search.fen,
            depth: search.depth,
            lines: search.lines.filter(Boolean).slice(0, search.multiPv),
          });
          hardReset(new Error('watchdog'));
        }, WATCHDOG_MS),
      };
      current = search;
      log('analyze: position', fen.slice(0, 30), 'multipv', multiPv);
      worker!.postMessage(`setoption name MultiPV value ${multiPv}`);
      worker!.postMessage(`position fen ${fen}`);
      worker!.postMessage(`go depth ${depth} movetime ${movetimeMs}`);
    });
  },

  stop(): void {
    hardReset();
  },
};
