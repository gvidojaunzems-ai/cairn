// qa-spec: S2 — Sample long job emits >=1 job.progress then a terminal
// job.done; progress precedes done.
//
// The manager owns a background Worker in production. For test isolation
// we inject a `workerFactory` that runs the real `runSampleLongJob`
// in-process and posts the same {type:'progress'|'done'|'error'} messages
// the real worker would post. The manager wiring is exercised end-to-end;
// only the `new Worker(path)` call is stubbed.
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

/**
 * In-process fake worker: routes {type:'start', kind:'sample-long-job'}
 * to `runSampleLongJob`, and posts progress/done/error messages back
 * through the same channel the real worker would use.
 */
function makeInProcessWorker(): WorkerAdapter {
  let messageHandler: ((m: WorkerToMainMessage) => void) | undefined;
  const cancelled = new Map<string, boolean>();

  const adapter: WorkerAdapter = {
    postMessage: (message: MainToWorkerMessage): void => {
      if (message.type === 'cancel') {
        cancelled.set(message.jobId, true);
        return;
      }
      if (message.type === 'shutdown') {
        return;
      }
      if (message.type === 'start' && message.kind === 'sample-long-job') {
        const { jobId } = message;
        const input = (message.input ?? {}) as { steps?: number; stepMs?: number };
        // Kick off runner asynchronously so postMessage returns first.
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
  return adapter;
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

describeDb('sample long job — happy path (S2)', () => {
  beforeEach(() => {
    ({ store, dir } = openTestStore('cairn-sample-long-'));
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

  // qa-spec: S2
  it('emits at least one job.progress before a terminal job.done', async () => {
    const bus = createEventBus({ getWebContents: () => [makeFakeContents(events)] });
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: bus,
      workerFactory: () => makeInProcessWorker(),
      // Disable progress throttling for this test so every tick is observed.
      progressThrottleMs: 0,
    });

    const { jobId } = manager.startSampleLongJob({ steps: 5, stepMs: 10 });

    await waitFor(() =>
      events.find(
        (e) =>
          e.channel === 'job.done' &&
          (e.payload as { jobId?: string }).jobId === jobId,
      ) ?? null,
    );

    const progressEvents = events.filter(
      (e) =>
        e.channel === 'job.progress' &&
        (e.payload as { jobId?: string }).jobId === jobId,
    );
    const doneEvent = events.find(
      (e) =>
        e.channel === 'job.done' &&
        (e.payload as { jobId?: string }).jobId === jobId,
    );

    expect(progressEvents.length).toBeGreaterThanOrEqual(1);
    expect(doneEvent).toBeDefined();

    // qa-spec: S2 — every progress event carries jobId + pct + label.
    for (const p of progressEvents) {
      const payload = p.payload as {
        jobId?: unknown;
        pct?: unknown;
        label?: unknown;
      };
      expect(typeof payload.jobId).toBe('string');
      expect(typeof payload.pct).toBe('number');
      expect(typeof payload.label).toBe('string');
      expect(payload.pct as number).toBeGreaterThanOrEqual(0);
      expect(payload.pct as number).toBeLessThanOrEqual(100);
    }

    // qa-spec: S2 — progress precedes done in emission order.
    const lastProgressAt = progressEvents[progressEvents.length - 1]?.at ?? 0;
    const doneAt = doneEvent?.at ?? 0;
    expect(doneAt).toBeGreaterThanOrEqual(lastProgressAt);

    // qa-spec: S2 — the terminal job.done carries a result (not an error).
    const donePayload = doneEvent?.payload as {
      result?: unknown;
      error?: unknown;
    };
    expect(donePayload.result).toBeDefined();
    expect(donePayload.error).toBeUndefined();
  });

  // qa-spec: S2 — jobsDao row transitions to succeeded on completion.
  it('persists the job as succeeded on happy-path completion', async () => {
    const bus = createEventBus({ getWebContents: () => [makeFakeContents(events)] });
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: bus,
      workerFactory: () => makeInProcessWorker(),
      progressThrottleMs: 0,
    });
    const { jobId } = manager.startSampleLongJob({ steps: 3, stepMs: 10 });

    await waitFor(() =>
      events.find(
        (e) =>
          e.channel === 'job.done' &&
          (e.payload as { jobId?: string }).jobId === jobId,
      ) ?? null,
    );

    const row = store.jobsDao.getById(jobId);
    expect(row?.status).toBe('succeeded');
  });
});
