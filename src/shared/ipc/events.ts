/**
 * Server → UI event bus contract.
 *
 * Business rules:
 *   - Exactly ten (10) event names are supported. Adding an eleventh
 *     requires a new ADR — the renderer subscribes by name and every
 *     event has a documented payload shape.
 *   - Every payload is a plain data object. No functions, class
 *     instances, or `undefined` values — they do not survive the IPC
 *     structured-clone hop.
 *   - Event names are lower-case dot-delimited (`namespace.op`) so a
 *     future filter/subscription grammar can partition by prefix.
 */

/**
 * The full, closed set of event names. `readonly [...] as const` keeps
 * the tuple literal type so consumers can `typeof EVENT_NAMES[number]`
 * to derive `EventName`.
 */
export const EVENT_NAMES = [
  'job.progress',
  'job.done',
  'job.cancelled',
  'system.ready',
  'system.error',
  'settings.changed',
  'projects.changed',
  'sync.progress',
  'sync.done',
  'notification.emit',
] as const;

/** Union of every legal event name. */
export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Progress tick for a background job. Emitted at most every 50 ms per
 * job (see `job-manager.ts` throttling logic).
 */
export interface JobProgressEvent {
  jobId: string;
  /** 0..100 inclusive. */
  pct: number;
  /** Short human-safe label (goes through `t()` on the UI side). */
  label: string;
}

/**
 * Terminal completion signal for a background job. Exactly one of
 * `result` or `error` is populated. Cancellation surfaces here as
 * `error.code = 'cancelled'`.
 */
export interface JobDoneEvent {
  jobId: string;
  result?: unknown;
  error?: { code: string; message: string };
}

/**
 * Cancellation acknowledgement. Emitted alongside `job.done` with an
 * `error.code = 'cancelled'`; consumers that only care about cancel
 * (not general failure) can subscribe to this narrower event.
 */
export interface JobCancelledEvent {
  jobId: string;
  reason?: string;
}

/** Fired once, after main-process bootstrap is complete and the DB is open. */
export interface SystemReadyEvent {
  apiVersion: string;
}

/** Fired when a system-level error is surfaced (out-of-band from IPC calls). */
export interface SystemErrorEvent {
  message: string;
  code?: string;
}

/** Fired when user settings change so open renderers can re-render. */
export interface SettingsChangedEvent {
  keys: readonly string[];
}

/** Fired when the projects list changes so navigation surfaces refresh. */
export interface ProjectsChangedEvent {
  projectIds: readonly string[];
}

/** Progress tick for a long-running sync (git pull, index rebuild, etc.). */
export interface SyncProgressEvent {
  syncId: string;
  pct: number;
  label: string;
}

/** Terminal completion signal for a sync. */
export interface SyncDoneEvent {
  syncId: string;
  result?: unknown;
  error?: { code: string; message: string };
}

/** Toast / notification the UI should surface to the user. */
export interface NotificationEmitEvent {
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
}

/**
 * Map from event name to payload type. Used by the event bus and by the
 * preload `on(event, handler)` typing so subscribers get compile-time
 * payload checking.
 */
export interface EventPayloads {
  'job.progress': JobProgressEvent;
  'job.done': JobDoneEvent;
  'job.cancelled': JobCancelledEvent;
  'system.ready': SystemReadyEvent;
  'system.error': SystemErrorEvent;
  'settings.changed': SettingsChangedEvent;
  'projects.changed': ProjectsChangedEvent;
  'sync.progress': SyncProgressEvent;
  'sync.done': SyncDoneEvent;
  'notification.emit': NotificationEmitEvent;
}

/** Handler function type for a specific event. */
export type EventHandler<E extends EventName> = (payload: EventPayloads[E]) => void;
