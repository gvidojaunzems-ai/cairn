/**
 * Server → UI event bus. Fans events out to every live `webContents`
 * instance via `webContents.send`.
 *
 * Business rules:
 *   - Exactly the ten declared events in `src/shared/ipc/events.ts` are
 *     emitted through this bus. Attempting to emit an unknown event is
 *     rejected at compile time by the generic constraint on `emit`.
 *   - A dead `webContents` is skipped silently so a closed window never
 *     crashes the bus.
 *   - The bus is a plain object factory (no class) so tests can build a
 *     memory-backed variant without patching Electron globals.
 */
import { webContents as electronWebContents } from 'electron';

import type {
  EventName,
  EventPayloads,
  JobCancelledEvent,
  JobDoneEvent,
  JobProgressEvent,
  NotificationEmitEvent,
  ProjectsChangedEvent,
  SettingsChangedEvent,
  SyncDoneEvent,
  SyncProgressEvent,
  SystemErrorEvent,
  SystemReadyEvent,
} from '../../shared/ipc/events.js';

/**
 * Minimal shape of an Electron `WebContents` we depend on. Kept narrow so
 * tests can pass in a fake without stubbing the full class.
 */
export interface WebContentsLike {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

/** Factory contract exposed by the event bus. */
export interface EventBus {
  emit<E extends EventName>(event: E, payload: EventPayloads[E]): void;
  emitJobProgress(payload: JobProgressEvent): void;
  emitJobDone(payload: JobDoneEvent): void;
  emitJobCancelled(payload: JobCancelledEvent): void;
  emitSystemReady(payload: SystemReadyEvent): void;
  emitSystemError(payload: SystemErrorEvent): void;
  emitSettingsChanged(payload: SettingsChangedEvent): void;
  emitProjectsChanged(payload: ProjectsChangedEvent): void;
  emitSyncProgress(payload: SyncProgressEvent): void;
  emitSyncDone(payload: SyncDoneEvent): void;
  emitNotificationEmit(payload: NotificationEmitEvent): void;
}

interface CreateEventBusOptions {
  /**
   * Enumerate all currently live `WebContents`. Defaults to
   * `electron.webContents.getAllWebContents()`. Tests can inject a
   * memory-backed list to observe emissions.
   */
  getWebContents?: () => readonly WebContentsLike[];
}

/**
 * Return every currently live `WebContents` instance. Falls back to an
 * empty list when the Electron module is not available (e.g. inside a
 * pure unit test with `electron` unstubbed).
 */
function defaultGetWebContents(): readonly WebContentsLike[] {
  try {
    const list = electronWebContents?.getAllWebContents?.();
    return Array.isArray(list) ? (list as unknown as WebContentsLike[]) : [];
  } catch {
    return [];
  }
}

/**
 * Build an event bus that fans out via `webContents.send`. The channel
 * name is the event name verbatim so the preload can subscribe by name.
 */
export function createEventBus(options: CreateEventBusOptions = {}): EventBus {
  const getWebContents = options.getWebContents ?? defaultGetWebContents;

  function emit<E extends EventName>(event: E, payload: EventPayloads[E]): void {
    const targets = getWebContents();
    for (const target of targets) {
      if (target.isDestroyed()) {
        continue;
      }
      try {
        target.send(event, payload);
      } catch {
        // A single WebContents failure must never crash the bus.
      }
    }
  }

  return {
    emit,
    emitJobProgress: (payload) => emit('job.progress', payload),
    emitJobDone: (payload) => emit('job.done', payload),
    emitJobCancelled: (payload) => emit('job.cancelled', payload),
    emitSystemReady: (payload) => emit('system.ready', payload),
    emitSystemError: (payload) => emit('system.error', payload),
    emitSettingsChanged: (payload) => emit('settings.changed', payload),
    emitProjectsChanged: (payload) => emit('projects.changed', payload),
    emitSyncProgress: (payload) => emit('sync.progress', payload),
    emitSyncDone: (payload) => emit('sync.done', payload),
    emitNotificationEmit: (payload) => emit('notification.emit', payload),
  };
}
