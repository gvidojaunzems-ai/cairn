/**
 * Renderer-side IPC client — a thin, testable wrapper over `window.cairn`.
 *
 * Business rules:
 *   - The renderer never touches Electron / Node primitives directly. Every
 *     IPC call goes through the preload `contextBridge`, which is enumerated
 *     on `window.cairn` (see `src/preload/index.ts`).
 *   - `invoke()` always resolves to a `CoreServiceResult<T>` — it never throws
 *     across the transport. Transport-layer failures (missing bridge, structured
 *     clone error) surface as `ok:false` results so consumers can react without
 *     wiring `try/catch` on every call site.
 *   - `subscribe()` returns an unsubscribe callback so React `useEffect` and
 *     plain listeners can unwind subscriptions symmetrically.
 *   - This module is the renderer's *contract* against the preload surface —
 *     the `CairnPreloadAPI` interface here is the shape the preload MUST expose.
 *     Keeping the type here (rather than importing it from `src/preload/**`)
 *     avoids pulling the preload tree into the renderer tsconfig include set
 *     and keeps the renderer bundle free of Electron / Node references.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract';
import type { ApiVersion } from '../../shared/ipc/api-version';
import type {
  EventHandler,
  EventName,
  EventPayloads,
} from '../../shared/ipc/events';
import type {
  NamespaceName,
  OpName,
} from '../../shared/ipc/operations';

/**
 * The property name under which the preload bridge is exposed on `window`.
 * Mirrors `preloadApiName` in `src/preload/index.ts` — kept as a runtime
 * constant here (not a re-export) because the renderer tsconfig does not
 * include the preload tree.
 */
export const PRELOAD_API_NAME = 'cairn';

/**
 * Shape of the preload API exposed on `window.cairn`.
 *
 * This is the renderer's expectation contract — `src/preload/index.ts` MUST
 * expose an object structurally compatible with this interface. Backend owns
 * the preload script; renderer owns this contract shape.
 */
export interface CairnPreloadAPI {
  /** Ask the main process to relaunch the app (used by the React error boundary). */
  restartApp: () => void;
  /**
   * Invoke a namespaced core-service operation. Always resolves to a
   * `CoreServiceResult<T>` — never rejects for domain-level failures.
   */
  invoke: <TReq = unknown, TRes = unknown>(
    namespace: NamespaceName,
    op: string,
    input?: TReq,
  ) => Promise<CoreServiceResult<TRes>>;
  /**
   * Subscribe to a server → UI event by name. Returns an unsubscribe callback.
   */
  on: <E extends EventName>(event: E, handler: EventHandler<E>) => () => void;
  /**
   * Explicit unsubscribe. Callers that captured the callback returned by
   * `on()` should prefer that — `off()` exists for callers that only have
   * the handler reference.
   */
  off: <E extends EventName>(event: E, handler: EventHandler<E>) => void;
  /** Semver-style version of the IPC surface the preload was built against. */
  apiVersion: ApiVersion;
}

/**
 * Handler signature for a subscribed event. Re-exported as the primary
 * name used by the client — thin alias over the shared `EventHandler<E>`.
 */
export type IpcEventHandler<E extends EventName> = EventHandler<E>;

/**
 * Thin, testable wrapper over `window.cairn`. Held as a class so tests can
 * inject a stub preload bridge without touching globals, and so a caller
 * that wants a single stable reference (e.g. via `useRef`) can hold on to it.
 */
export class CairnRendererClient {
  public constructor(private readonly api: CairnPreloadAPI) {}

  /**
   * Invoke a core-service operation and return its `CoreServiceResult<T>`.
   * The `TReq` / `TRes` generics are exposed explicitly so callers can pin
   * request / response types at the call site without the generic inference
   * getting in the way.
   */
  public invoke<TReq = unknown, TRes = unknown>(
    namespace: NamespaceName,
    op: string,
    input?: TReq,
  ): Promise<CoreServiceResult<TRes>> {
    return this.api.invoke<TReq, TRes>(namespace, op, input);
  }

  /**
   * Subscribe to a server → UI event. Returns an unsubscribe callback.
   * Callers should call the returned function on cleanup (React effect
   * teardown, listener removal, etc.) so the bridge's internal listener
   * table stays free of leaks.
   */
  public subscribe<E extends EventName>(
    event: E,
    handler: EventHandler<E>,
  ): () => void {
    return this.api.on<E>(event, handler);
  }

  /** Explicit unsubscribe — see `off` on `CairnPreloadAPI`. */
  public unsubscribe<E extends EventName>(
    event: E,
    handler: EventHandler<E>,
  ): void {
    this.api.off<E>(event, handler);
  }

  /** Version string reported by the preload bridge. */
  public get apiVersion(): ApiVersion {
    return this.api.apiVersion;
  }
}

/**
 * Read `window.cairn` and wrap it in a `CairnRendererClient`. Throws if the
 * preload bridge is missing — no core-service call can succeed without it,
 * and failing fast is easier to diagnose than silent no-ops.
 */
export function createRendererClient(): CairnRendererClient {
  if (typeof window === 'undefined' || !window.cairn) {
    throw new Error(
      'Cairn preload bridge missing on window.cairn — renderer bootstrap error.',
    );
  }
  return new CairnRendererClient(window.cairn);
}

// Re-export the shared event types so downstream renderer modules only need
// to import from `@renderer/ipc` (or the equivalent relative path).
export type { EventName, EventPayloads, NamespaceName, OpName };
