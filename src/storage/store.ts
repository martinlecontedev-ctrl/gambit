import { useSyncExternalStore } from 'react';
import { subscribe } from './repository';

/**
 * Subscribe a component to the local repo. Snapshots must return stable
 * references between writes — the repo caches arrays for that reason.
 */
export function useStored<T>(getSnapshot: () => T): T {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
