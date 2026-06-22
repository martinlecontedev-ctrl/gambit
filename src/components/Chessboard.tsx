import { useEffect, useRef } from 'react';
import { Chessground as createChessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';

type Props = {
  config?: Config;
  onReady?: (api: Api) => void;
  className?: string;
};

/**
 * Thin React wrapper around chessground. Initializes once on mount, then
 * forwards every new `config` through `api.set` — the canonical chessground
 * update path. Parents that need imperative control receive the api via
 * `onReady`.
 */
export function Chessboard({ config, onReady, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!hostRef.current) return;
    const api = createChessground(hostRef.current, config);
    apiRef.current = api;
    onReadyRef.current?.(api);
    return () => {
      api.destroy();
      apiRef.current = null;
    };
    // Init runs once; subsequent config updates flow through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (config && apiRef.current) apiRef.current.set(config);
  }, [config]);

  return (
    <div
      className={
        className ??
        // Frame via ring (box-shadow), NOT border: a 1px border would shrink
        // the content box to 526px, making each 12.5% square 65.75px and
        // leaving a 2-3px sub-pixel gap at the bottom/right. A ring keeps the
        // board at a clean multiple of 8.
        'aspect-square w-full overflow-hidden rounded-xl shadow-board ring-1 ring-board-frame'
      }
    >
      <div ref={hostRef} className="cg-wrap h-full w-full" />
    </div>
  );
}
