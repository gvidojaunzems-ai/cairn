/**
 * Electron preload script — the ONLY IPC bridge between the renderer and
 * the main process.
 *
 * Business rules:
 *   - The renderer runs with contextIsolation:true and sandbox:true. That
 *     means it never sees `ipcRenderer` directly — every IPC surface must
 *     be enumerated here and exposed via `contextBridge.exposeInMainWorld`.
 *   - The exposed API is deliberately narrow: a single typed `invoke()`
 *     that routes through the shared IPC descriptor tables, plus
 *     `on(event, handler)` / `off(event, handler)` shims for the ten
 *     server → UI events.
 *   - `ipcRenderer` is NEVER re-exported. The architecture lint test
 *     asserts the renderer never imports it directly.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { CoreServiceResult } from '../contracts/core-service.contract.js';
import { API_VERSION } from '../shared/ipc/api-version.js';
import type {
  EventHandler,
  EventName,
  EventPayloads,
} from '../shared/ipc/events.js';
import type {
  NamespaceName,
  OpName,
  QualifiedOpId,
} from '../shared/ipc/operations.js';

/**
 * The channel name for renderer-initiated app restarts. Mirrors
 * `RESTART_APP_CHANNEL` in `src/main/index.ts` — keep in sync.
 */
export const RESTART_APP_CHANNEL = 'restart-app';

/**
 * Typed surface exposed to `window.cairn` in the renderer.
 * Any addition to this interface must be paired with a corresponding
 * `contextBridge.exposeInMainWorld` entry below.
 */
export interface CairnPreloadAPI {
  /** Transport contract version — matches `API_VERSION`. */
  readonly apiVersion: string;

  /**
   * Invoke a namespaced core-service op. Every response is a
   * `CoreServiceResult<T>` — never a thrown exception.
   */
  invoke: <N extends NamespaceName>(
    namespace: N,
    op: OpName<N>,
    input?: unknown,
  ) => Promise<CoreServiceResult<unknown>>;

  /**
   * Subscribe to a server → UI event. Returns a disposer that
   * unregisters the handler when called.
   */
  on: <E extends EventName>(event: E, handler: EventHandler<E>) => () => void;

  /** Explicit unsubscribe (also invocable via the disposer returned by `on`). */
  off: <E extends EventName>(event: E, handler: EventHandler<E>) => void;

  /** Ask the main process to relaunch the app (used by the React error boundary). */
  restartApp: () => void;
}

/**
 * The property name under which the API is exposed on `window`.
 * Used by both the preload and the renderer.
 */
export const preloadApiName = 'cairn';

/**
 * Weak-map linking user-supplied handlers to the internal listener the
 * preload registered with `ipcRenderer.on`. Needed so `off()` can
 * dereference the exact wrapper `on()` created.
 */
const listenerRegistry = new WeakMap<
  EventHandler<EventName>,
  (event: IpcRendererEvent, payload: unknown) => void
>();

function subscribe<E extends EventName>(
  event: E,
  handler: EventHandler<E>,
): () => void {
  const wrapper = (_event: IpcRendererEvent, payload: unknown): void => {
    handler(payload as EventPayloads[E]);
  };
  listenerRegistry.set(handler as EventHandler<EventName>, wrapper);
  ipcRenderer.on(event, wrapper);
  return (): void => {
    unsubscribe(event, handler);
  };
}

function unsubscribe<E extends EventName>(event: E, handler: EventHandler<E>): void {
  const wrapper = listenerRegistry.get(handler as EventHandler<EventName>);
  if (!wrapper) {
    return;
  }
  ipcRenderer.removeListener(event, wrapper);
  listenerRegistry.delete(handler as EventHandler<EventName>);
}

const api: CairnPreloadAPI = {
  apiVersion: API_VERSION,
  invoke: <N extends NamespaceName>(
    namespace: N,
    op: OpName<N>,
    input?: unknown,
  ): Promise<CoreServiceResult<unknown>> => {
    const channel: QualifiedOpId = `${namespace}.${op}`;
    return ipcRenderer.invoke(channel, input ?? {}) as Promise<
      CoreServiceResult<unknown>
    >;
  },
  on: subscribe,
  off: unsubscribe,
  restartApp: (): void => {
    ipcRenderer.send(RESTART_APP_CHANNEL);
  },
};

// `contextBridge` is unavailable in unit tests that stub electron — guard so
// importing this module for type extraction doesn't throw.
if (typeof contextBridge?.exposeInMainWorld === 'function') {
  contextBridge.exposeInMainWorld(preloadApiName, api);
}
