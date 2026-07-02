/**
 * Server → UI event bus. Fans events out to every live `webContents`
 * instance via `webContents.send`.
 *
 * Catalog: Spec 03 (ADR 0007) — sync.updated, job.progress, job.done,
 * signals.updated, news.updated, budget.updated, meeting.partial,
 * meeting.proposals, setup.progress, toast.
 */
import { webContents as electronWebContents } from 'electron';

import type {
  EventName,
  EventPayloads,
  JobDoneEvent,
  JobProgressEvent,
} from '../../shared/ipc/events.js';

export interface WebContentsLike {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

export interface EventBus {
  emit<E extends EventName>(event: E, payload: EventPayloads[E]): void;
  emitJobProgress(payload: JobProgressEvent): void;
  emitJobDone(payload: JobDoneEvent): void;
}

interface CreateEventBusOptions {
  getWebContents?: () => readonly WebContentsLike[];
}

function defaultGetWebContents(): readonly WebContentsLike[] {
  try {
    const list = electronWebContents?.getAllWebContents?.();
    return Array.isArray(list) ? (list as unknown as WebContentsLike[]) : [];
  } catch {
    return [];
  }
}

export function createEventBus(options: CreateEventBusOptions = {}): EventBus {
  const getWebContents = options.getWebContents ?? defaultGetWebContents;

  function emit<E extends EventName>(event: E, payload: EventPayloads[E]): void {
    for (const target of getWebContents()) {
      if (target.isDestroyed()) continue;
      try {
        target.send(event, payload);
      } catch {
        // skip dead targets
      }
    }
  }

  return {
    emit,
    emitJobProgress: (payload) => emit('job.progress', payload),
    emitJobDone: (payload) => emit('job.done', payload),
  };
}
