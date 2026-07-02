import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CoreServiceResult } from '../../contracts/core-service.contract';
import type { ApiVersion } from '../../shared/ipc/api-version';
import type { EventHandler, EventName } from '../../shared/ipc/events';
import type { NamespaceName } from '../../shared/ipc/operations';
import {
  createRendererClient,
  type CairnRendererClient,
} from '../ipc/client';

/**
 * User-safe fallback message used when the transport layer itself throws
 * (e.g. structured-clone failure, bridge missing after a hot reload).
 */
const TRANSPORT_ERROR_MESSAGE = 'IPC transport error';

/**
 * Internal loading / error tracking for the hook. Kept as a discriminated
 * object rather than two independent `useState` calls so a single `setState`
 * always leaves the two fields consistent.
 */
interface UseCoreServiceInternalState {
  loading: boolean;
  error: string | null;
}

/**
 * Return shape of {@link useCoreService}. `invoke` and `subscribe` are stable
 * across renders; `loading` and `error` re-render on transport activity.
 */
export interface UseCoreServiceReturn {
  /**
   * Invoke a core-service op. Always resolves to a `CoreServiceResult<TRes>`.
   * Transport-layer errors (missing bridge, structured clone failure) are
   * converted to `ok:false` results — the returned promise never rejects.
   */
  invoke: <TReq = unknown, TRes = unknown>(
    namespace: NamespaceName,
    op: string,
    input?: TReq,
  ) => Promise<CoreServiceResult<TRes>>;
  /**
   * Subscribe to a server → UI event. Returns an unsubscribe callback that
   * the caller MAY invoke; the hook also auto-cleans on unmount.
   */
  subscribe: <E extends EventName>(
    event: E,
    handler: EventHandler<E>,
  ) => () => void;
  /** Semver-style API version reported by the preload bridge. */
  apiVersion: ApiVersion;
  /** True while at least one `invoke()` call is in flight. */
  loading: boolean;
  /** Last user-safe error message, or `null` if the last invoke succeeded. */
  error: string | null;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return TRANSPORT_ERROR_MESSAGE;
}

/**
 * Build a `CoreServiceResult<T>` failure arm for a transport-layer error.
 * We synthesise this on the renderer side (rather than letting the promise
 * reject) so consumers never need `try/catch` around an `invoke()` call —
 * the Result contract holds even when the bridge itself misbehaves.
 */
function buildTransportErrorResult<T>(
  message: string,
  apiVersion: ApiVersion,
): CoreServiceResult<T> {
  return {
    ok: false,
    apiVersion,
    error: {
      code: 'internal',
      message,
    },
  };
}

/**
 * React hook returning a stable `{invoke, subscribe}` pair that dispatches
 * to the core service via `window.cairn`, plus lightweight `loading` /
 * `error` state for consumers that want a simple in-flight indicator.
 *
 * Business rules:
 *   - Subscriptions registered through the returned `subscribe` are tracked
 *     in an internal ref set and unsubscribed on component unmount so a
 *     rapidly-mounted/unmounted component cannot leak listeners into the
 *     preload bridge.
 *   - Loading / error state updates are guarded by a mount ref so an
 *     `invoke()` that resolves after unmount does not trigger a warning.
 *   - `apiVersion` is read once at hook init; the preload surface is
 *     treated as immutable for the lifetime of the process.
 */
export function useCoreService(): UseCoreServiceReturn {
  // Lazily create the client exactly once per hook instance. `useRef` gives
  // us that stability without re-running `createRendererClient()` on every
  // render (which would throw a fresh error if the bridge disappeared).
  const clientRef = useRef<CairnRendererClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = createRendererClient();
  }
  const client = clientRef.current;

  const unsubscribersRef = useRef<Set<() => void>>(new Set());
  const mountedRef = useRef<boolean>(true);
  const [state, setState] = useState<UseCoreServiceInternalState>({
    loading: false,
    error: null,
  });

  useEffect(() => {
    mountedRef.current = true;
    const disposers = unsubscribersRef.current;
    return () => {
      mountedRef.current = false;
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // Listener is being torn down anyway; swallow to avoid masking
          // the real teardown reason with an unrelated cleanup error.
        }
      }
      disposers.clear();
    };
  }, []);

  const invoke = useCallback(
    async <TReq = unknown, TRes = unknown>(
      namespace: NamespaceName,
      op: string,
      input?: TReq,
    ): Promise<CoreServiceResult<TRes>> => {
      if (mountedRef.current) {
        setState({ loading: true, error: null });
      }
      try {
        const result = await client.invoke<TReq, TRes>(namespace, op, input);
        if (mountedRef.current) {
          setState({
            loading: false,
            error: result.ok ? null : result.error.message,
          });
        }
        return result;
      } catch (err) {
        const message = extractErrorMessage(err);
        if (mountedRef.current) {
          setState({ loading: false, error: message });
        }
        // Preserve the Result contract even for transport errors so callers
        // never need a try/catch around an invoke.
        return buildTransportErrorResult<TRes>(message, client.apiVersion);
      }
    },
    [client],
  );

  const subscribe = useCallback(
    <E extends EventName>(
      event: E,
      handler: EventHandler<E>,
    ): (() => void) => {
      const rawDispose = client.subscribe<E>(event, handler);
      // Wrap so the disposer removes itself from the tracked set on manual
      // invocation — otherwise the unmount sweep would double-dispose.
      const wrapped = (): void => {
        unsubscribersRef.current.delete(wrapped);
        try {
          rawDispose();
        } catch {
          // See comment in effect teardown.
        }
      };
      unsubscribersRef.current.add(wrapped);
      return wrapped;
    },
    [client],
  );

  return useMemo<UseCoreServiceReturn>(
    () => ({
      invoke,
      subscribe,
      apiVersion: client.apiVersion,
      loading: state.loading,
      error: state.error,
    }),
    [invoke, subscribe, client, state.loading, state.error],
  );
}
