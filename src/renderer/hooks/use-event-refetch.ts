import { useEffect } from 'react';
import type { EventName } from '../../shared/ipc/events';
import { useCoreService } from './use-core-service';

const REFETCH_EVENTS = [
  'sync.updated',
  'signals.updated',
  'news.updated',
  'budget.updated',
] as const satisfies readonly EventName[];

/**
 * Subscribe to data-change events and invoke `refetch` when any fires.
 */
export function useEventRefetch(refetch: () => void): void {
  const { subscribe } = useCoreService();

  useEffect(() => {
    const disposers = REFETCH_EVENTS.map((event) =>
      subscribe(event, () => {
        refetch();
      }),
    );
    return () => {
      for (const dispose of disposers) {
        dispose();
      }
    };
  }, [subscribe, refetch]);
}
