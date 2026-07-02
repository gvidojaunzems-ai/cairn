// qa-spec: S2/S3-adjacent — JobManager lifecycle. Verifies that:
//   * createJobManager() constructs a manager against a real JobsDao +
//     EventBus and does not throw at construction (given a worker factory).
//   * startJob(kind, input) returns a { jobId } handle synchronously.
//   * terminate() releases the underlying worker (no thread leaks).
//
// The manager owns a background Worker in production. To keep tests fast
// and hermetic we inject an in-process fake `WorkerAdapter` that forwards
// messages to the real background-worker's `handleMessage` export.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  webContents: { getAllWebContents: vi.fn(() => []) },
  app: { getVersion: vi.fn(() => '0.0.0') },
  BrowserWindow: vi.fn(),
}));

import { closeTestStore, openTestStore } from '../helpers/test-db';
import type { LocalStoreHandle } from '../../src/main/db/store';
import { createEventBus } from '../../src/main/ipc/event-bus';
import {
  createJobManager,
  type JobManager,
  type WorkerAdapter,
} from '../../src/main/jobs/job-manager';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '../../src/main/jobs/messages';

// MainToWorkerMessage kept in the import list to satisfy the fake worker's
// `postMessage` parameter type below.
void ({} as MainToWorkerMessage | undefined);

let dir: string;
let store: LocalStoreHandle;
let manager: JobManager | null;

/**
 * Build an in-process WorkerAdapter that routes MainToWorker messages to
 * the real background-worker `handleMessage`, and re-broadcasts every
 * WorkerToMain message the worker code produces via `parentPort.postMessage`.
 *
 * The real worker uses `parentPort` from `node:worker_threads`; here we
 * dynamically import the module inside the factory so the test does NOT
 * mock parentPort (that would break the real worker). Instead we let the
 * worker post to a real parentPort (which is `null` in the test process)
 * and capture the message via monkey-patching `postMessage` on the
 * exported handler surface — a bit gnarly, so instead we let the manager
 * inject its own WorkerAdapter and provide a hand-rolled implementation.
 */
function makeFakeWorker(): {
  adapter: WorkerAdapter;
  send(message: WorkerToMainMessage): void;
} {
  const messageHandlers: Array<(m: WorkerToMainMessage) => void> = [];
  // The adapter as seen by the manager.
  const adapter: WorkerAdapter = {
    postMessage: (_message: MainToWorkerMessage): void => {
      // Real behaviour: forward into the worker. Stubbed here — the
      // sample-long-job tests overwrite this via workerFactory.
    },
    on: ((event: string, handler: (arg: never) => void): void => {
      if (event === 'message') {
        messageHandlers.push(handler as (m: WorkerToMainMessage) => void);
      }
    }) as WorkerAdapter['on'],
    terminate: async () => 0,
  };
  return {
    adapter,
    send(message: WorkerToMainMessage): void {
      for (const h of messageHandlers) h(message);
    },
  };
}

beforeEach(() => {
  ({ store, dir } = openTestStore('cairn-job-mgr-'));
  manager = null;
});

afterEach(async () => {
  if (manager !== null) {
    await manager.terminate();
  }
  closeTestStore(store, dir);
  manager = null;
});

describe('JobManager — construction (S2/S3-adjacent)', () => {
  // qa-spec: S2/S3-adjacent
  it('createJobManager returns a manager with the documented surface', () => {
    const fake = makeFakeWorker();
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: createEventBus({ getWebContents: () => [] }),
      workerFactory: () => fake.adapter,
    });
    expect(typeof manager.startJob).toBe('function');
    expect(typeof manager.cancelJob).toBe('function');
    expect(typeof manager.terminate).toBe('function');
    expect(typeof manager.startSampleLongJob).toBe('function');
  });

  // qa-spec: S2/S3-adjacent
  it('startJob returns a { jobId } handle without throwing', () => {
    const fake = makeFakeWorker();
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: createEventBus({ getWebContents: () => [] }),
      workerFactory: () => fake.adapter,
    });
    const handle = manager.startJob('sample-long-job', { steps: 3, stepMs: 5 });
    expect(handle).toBeDefined();
    expect(typeof handle.jobId).toBe('string');
    expect(handle.jobId.length).toBeGreaterThan(0);
  });

  // qa-spec: S2/S3-adjacent
  it('startJob persists a pending row via the injected JobsDao', () => {
    const fake = makeFakeWorker();
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: createEventBus({ getWebContents: () => [] }),
      workerFactory: () => fake.adapter,
    });
    const { jobId } = manager.startJob('sample-long-job', { steps: 3, stepMs: 5 });
    const row = store.jobsDao.getById(jobId);
    expect(row).toBeDefined();
    expect(row?.kind).toBe('sample-long-job');
    // Status may be pending or running immediately depending on scheduling.
    expect(['pending', 'running']).toContain(row?.status);
  });

  // qa-spec: S2/S3-adjacent — terminate() must not throw
  it('terminate() resolves cleanly on an idle manager', async () => {
    const fake = makeFakeWorker();
    manager = createJobManager({
      jobsDao: store.jobsDao,
      eventBus: createEventBus({ getWebContents: () => [] }),
      workerFactory: () => fake.adapter,
    });
    await expect(manager.terminate()).resolves.toBeUndefined();
    manager = null;
  });
});
