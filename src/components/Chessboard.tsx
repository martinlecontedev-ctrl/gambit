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
    <div className={className ?? 'aspect-square w-full'}>
      <div ref={hostRef} className="cg-wrap h-full w-full" />
    </div>
  );
}
