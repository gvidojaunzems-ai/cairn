/**
 * @vitest-environment jsdom
 */
// qa-spec: S1 (renderer side), S2 (renderer side).
// Exercises the useCoreService React hook end-to-end against a shimmed
// window.cairn preload bridge. Asserts:
//   * invoke('system', 'getStatus') resolves to a CoreServiceResult with
//     ok:true, apiVersion, and data.ready === true.
//   * subscribe('job.progress', ...) receives payloads emitted by the shim.
//   * subscribe returns an unsubscribe callback that stops further delivery.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import type { CoreServiceResult } from '../../src/contracts/core-service.contract';
import type {
  EventHandler,
  EventName,
  EventPayloads,
} from '../../src/shared/ipc/events';
import type {
  NamespaceName,
} from '../../src/shared/ipc/operations';
import type { CairnPreloadAPI } from '../../src/renderer/ipc/client';
import { useCoreService } from '../../src/renderer/hooks/use-core-service';

/**
 * Build an in-memory preload bridge that satisfies `CairnPreloadAPI` so
 * the renderer client + hook can drive it without an Electron process.
 */
function makeShim(): {
  api: CairnPreloadAPI;
  emit<E extends EventName>(event: E, payload: EventPayloads[E]): void;
  listenerCount(event: EventName): number;
} {
  const listeners = new Map<EventName, Set<(payload: unknown) => void>>();

  const api: CairnPreloadAPI = {
    restartApp: vi.fn(),
    apiVersion: '1.0.0',
    invoke: (async <TReq = unknown, TRes = unknown>(
      namespace: NamespaceName,
      op: string,
      _input?: TReq,
    ): Promise<CoreServiceResult<TRes>> => {
      if (namespace === 'system' && op === 'getStatus') {
        return {
          ok: true,
          data: { ready: true } as unknown as TRes,
          apiVersion: '1.0.0',
        };
      }
      return {
        ok: false,
        error: { code: 'not_implemented', message: 'stub' },
        apiVersion: '1.0.0',
      };
    }) as CairnPreloadAPI['invoke'],
    on: (<E extends EventName>(
      event: E,
      handler: EventHandler<E>,
    ): (() => void) => {
      const set = listeners.get(event) ?? new Set<(payload: unknown) => void>();
      set.add(handler as (payload: unknown) => void);
      listeners.set(event, set);
      return () => {
        set.delete(handler as (payload: unknown) => void);
      };
    }) as CairnPreloadAPI['on'],
    off: (<E extends EventName>(
      event: E,
      handler: EventHandler<E>,
    ): void => {
      listeners.get(event)?.delete(handler as (payload: unknown) => void);
    }) as CairnPreloadAPI['off'],
  };

  return {
    api,
    emit<E extends EventName>(event: E, payload: EventPayloads[E]): void {
      for (const h of listeners.get(event) ?? []) h(payload);
    },
    listenerCount(event: EventName): number {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

let container: HTMLDivElement;
let root: Root;
let shim: ReturnType<typeof makeShim>;

beforeEach(() => {
  shim = makeShim();
  (window as unknown as { cairn?: CairnPreloadAPI }).cairn = shim.api;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  delete (window as unknown as { cairn?: CairnPreloadAPI }).cairn;
});

describe('useCoreService — round-trips system.getStatus (S1 renderer side)', () => {
  test('invoke("system", "getStatus") returns ok:true with apiVersion + data.ready', async () => {
    let captured: CoreServiceResult<{ ready: boolean }> | undefined;
    function Probe(): ReturnType<typeof createElement> {
      const { invoke } = useCoreService();
      useEffect(() => {
        void (async (): Promise<void> => {
          captured = await invoke<Record<string, never>, { ready: boolean }>(
            'system',
            'getStatus',
            {},
          );
        })();
      }, [invoke]);
      return createElement('span', { 'data-testid': 'probe' }, 'ready');
    }
    act(() => {
      root.render(createElement(Probe));
    });
    // Allow the effect + async invoke to flush.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(captured?.ok).toBe(true);
    if (captured?.ok) {
      expect(captured.apiVersion.length).toBeGreaterThan(0);
      expect(captured.data.ready).toBe(true);
    }
  });
});

describe('useCoreService — subscribe / unsubscribe (S2 renderer side)', () => {
  test('subscribe("job.progress", handler) receives payloads until unsubscribed', async () => {
    const received: EventPayloads['job.progress'][] = [];
    let unsubscribe: (() => void) | undefined;
    function Probe(): ReturnType<typeof createElement> {
      const { subscribe } = useCoreService();
      const [ready, setReady] = useState(false);
      useEffect(() => {
        unsubscribe = subscribe('job.progress', (payload) => {
          received.push(payload);
        });
        setReady(true);
        return () => {
          unsubscribe?.();
        };
      }, [subscribe]);
      return createElement('span', { 'data-testid': 'probe' }, ready ? 'yes' : 'no');
    }
    act(() => {
      root.render(createElement(Probe));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    // Emit twice; both should be captured.
    shim.emit('job.progress', { jobId: 'j-1', pct: 10, label: 'a' });
    shim.emit('job.progress', { jobId: 'j-1', pct: 20, label: 'b' });
    expect(received.length).toBe(2);
    expect(received[0]?.pct).toBe(10);
    expect(received[1]?.pct).toBe(20);

    // Unsubscribe and confirm no more deliveries.
    unsubscribe?.();
    shim.emit('job.progress', { jobId: 'j-1', pct: 30, label: 'c' });
    expect(received.length).toBe(2);
  });

  test('unmount cleans up all subscriptions', async () => {
    function Probe(): ReturnType<typeof createElement> {
      const { subscribe } = useCoreService();
      useEffect(() => {
        const off = subscribe('job.done', () => {});
        return () => {
          off();
        };
      }, [subscribe]);
      return createElement('span', { 'data-testid': 'probe' }, 'x');
    }
    act(() => {
      root.render(createElement(Probe));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(shim.listenerCount('job.done')).toBe(1);
    act(() => {
      root.unmount();
    });
    expect(shim.listenerCount('job.done')).toBe(0);
    // Prevent the afterEach hook from double-unmounting.
    root = createRoot(container);
  });
});
