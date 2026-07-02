// qa-spec: S3 — Sample long job cancellation → job.done with error field
// (code = 'cancelled'), no further job.progress events after cancellation.
//
// Uses the same in-process worker factory as the S2 happy-path test so
// the manager + runner glue is exercised end-to-end without needing a
// compiled worker script.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  webContents: { getAllWebContents: vi.fn(() => []) },
  app: { getVersion: vi.fn(() => '0.0.0') },
  BrowserWindow: vi.fn(),
}));

import { closeTestStore, openTestStore } from '../helpers/test-db';
import { describeDb } from '../helpers/native-db';
import type { LocalStoreHandle } from '../../src/main/db/store';
import { createEventBus } from '../../src/main/ipc/event-bus';
import type { WebContentsLike } from '../../src/main/ipc/event-bus';
import {
  createJobManager,
  type JobManager,
  type WorkerAdapter,
} from '../../src/main/jobs/job-manager';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '../../src/main/jobs/messages';
import { runSampleLongJob } from '../../src/main/jobs/sample-long-job';

interface EmittedEvent {
  channel: string;
  payload: unknown;
  at: number;
}

function makeFakeContents(sink: EmittedEvent[]): WebContentsLike {
  return {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => {
      sink.push({ channel, payload, at: Date.now() });
    },
  };
}

function makeInProcessWorker(): WorkerAdapter {
  let messageHandler: ((m: WorkerToMainMessage) => void) | undefined;
  const cancelled = new Map<string, boolean>();

  return {
    postMessage: (message: MainToWorkerMessage): void => {
      if (message.type === 'cancel') {
        cancelled.set(message.jobId, true);
        return;
      }
      if (message.type === 'shutdown') return;
      if (message.type === 'start' && message.kind === 'sample-long-job') {
        const { jobId } = message;
        const input = (message.input ?? {}) as { steps?: number; stepMs?: number };
        void (async (): Promise<void> => {
          messageHandler?.({ type: 'started', jobId });
          try {
            const result = await runSampleLongJob(input, {
              onProgress: (pct, label) => {
                if (cancelled.get(jobId) === true) return;
                messageHandler?.({ type: 'progress', jobId, pct, label });
              },
              isCancelled: () => cancelled.get(jobId) === true,
            });
            if (cancelled.get(jobId) === true) {
              messageHandler?.({
                type: 'error',
                jobId,
                error: { code: 'cancelled', message: 'cancelled' },
              });
              return;
            }
            messageHandler?.({ type: 'done', jobId, result });
          } catch (err: unknown) {
            const code =
              err && typeof err === 'object' && 'code' in err
                ? String((err as { code: unknown }).code)
                : 'internal';
            const msg =
              err && typeof err === 'object' && 'message' in err
                ? String((err as { message: unknown }).message)
                : 'error';
            messageHandler?.({ type: 'error', jobId, error: { code, message: msg } });
          } finally {
            cancelled.delete(jobId);
          }
        })();
      }
    },
    on: ((event: string, handler: (arg: never) => void): void => {
      if (event === 'message') {
        messageHandler = handler as (m: WorkerToMainMessage) => void;
      }
    }) as WorkerAdapter['on'],
    terminate: async () => 0,
  };
}

async function waitFor<T>(
  predicate: () => T | null | undefined,
  timeoutMs = 4000,
): Promise<T> {
  const start = Date.now();
  return new Promise<T>((resolve, reject) => {
    const tick = (): void => {
      const value = predicate();
      if (value !== undefined && value !== null) {
        resolve(value as T);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`waitFor timed out after ${timeoutMs} ms`));
        return;
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

let dir: string;
let store: LocalStoreHandle;
let manager: JobManager | null;
let events: EmittedEvent[];

describeDb('sample long job — cancellation (S3)', () => {
  beforeEach(() => {
    ({ store, dir } = openTestStore('cairn-sample-cancel-'));
    events = [];
    manager = null;
  });

  afterEach(async () => {
    if (manager !== null) {
      await manager.terminate();
    }
    closeTestStore(store, dir);
    manager = null;
  });

  // qa-spec: S3
  it('cancellation surfaces as job.done with error.code = "cancelled"', async () => {
    const bus = createEventBus({ getWebContents: () => [makeFakeContents(events)] });
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: bus,
      workerFactory: () => makeInProcessWorker(),
      progressThrottleMs: 0,
    });

    // Long enough to give us room to cancel mid-flight.
    const { jobId } = manager.startSampleLongJob({ steps: 20, stepMs: 30 });

    await waitFor(() =>
      events.find(
        (e) =>
          e.channel === 'job.progress' &&
          (e.payload as { jobId?: string }).jobId === jobId,
      ) ?? null,
    );

    manager.cancelJob(jobId);
    const cancelAt = Date.now();

    const done = await waitFor(() =>
      events.find(
        (e) =>
          e.channel === 'job.done' &&
          (e.payload as { jobId?: string }).jobId === jobId,
      ) ?? null,
    );

    // qa-spec: S3 — payload MUST have an error field, MUST NOT have a
    // result field, and the error code MUST be 'cancelled'.
    const payload = done.payload as {
      result?: unknown;
      error?: { code?: string; message?: string };
    };
    expect(payload.result).toBeUndefined();
    expect(payload.error).toBeDefined();
    expect(payload.error?.code).toBe('cancelled');
    expect(typeof payload.error?.message).toBe('string');

    // qa-spec: S3 — no progress events after job.done.
    const doneAt = done.at;
    const postDoneProgress = events.filter(
      (e) =>
        e.channel === 'job.progress' &&
        (e.payload as { jobId?: string }).jobId === jobId &&
        e.at > doneAt,
    );
    expect(postDoneProgress).toEqual([]);

    // And any progress event more than 200 ms after cancel is a violation.
    const suspicious = events.filter(
      (e) =>
        e.channel === 'job.progress' &&
        (e.payload as { jobId?: string }).jobId === jobId &&
        e.at - cancelAt > 200,
    );
    expect(suspicious).toEqual([]);
  });

  // qa-spec: S3 — cancelJob does not throw
  it('cancelJob does not throw when the target job exists', async () => {
    const bus = createEventBus({ getWebContents: () => [makeFakeContents(events)] });
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: bus,
      workerFactory: () => makeInProcessWorker(),
      progressThrottleMs: 0,
    });

    const { jobId } = manager.startSampleLongJob({ steps: 20, stepMs: 30 });
    await waitFor(() =>
      events.find(
        (e) =>
          e.channel === 'job.progress' &&
          (e.payload as { jobId?: string }).jobId === jobId,
      ) ?? null,
    );

    expect(() => manager?.cancelJob(jobId)).not.toThrow();

    await waitFor(() =>
      events.find(
        (e) =>
          e.channel === 'job.done' &&
          (e.payload as { jobId?: string }).jobId === jobId,
      ) ?? null,
    );
  });

  // qa-spec: S3 — jobsDao row transitions to cancelled.
  it('persists the job as cancelled', async () => {
    const bus = createEventBus({ getWebContents: () => [makeFakeContents(events)] });
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: bus,
      workerFactory: () => makeInProcessWorker(),
      progressThrottleMs: 0,
    });

    const { jobId } = manager.startSampleLongJob({ steps: 20, stepMs: 30 });
    await waitFor(() =>
      events.find(
        (e) =>
          e.channel === 'job.progress' &&
          (e.payload as { jobId?: string }).jobId === jobId,
      ) ?? null,
    );
    manager.cancelJob(jobId);
    await waitFor(() =>
      events.find(
        (e) =>
          e.channel === 'job.done' &&
          (e.payload as { jobId?: string }).jobId === jobId,
      ) ?? null,
    );

    const row = store.jobsDao.getById(jobId);
    expect(row?.status).toBe('cancelled');
  });
});
