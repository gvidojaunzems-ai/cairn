/**
 * Job manager — the main-thread coordinator that spawns a single
 * background worker thread, persists lifecycle to the `jobs` table, and
 * fans out `job.progress` / `job.done` events over the event bus.
 *
 * Business rules:
 *   - `startJob` inserts a row with status='pending' BEFORE returning so
 *     the row survives a process crash (S2 recovery semantics).
 *   - Progress events are throttled to at most one every 50 ms per job
 *     to keep the IPC channel from flooding the renderer.
 *   - Only the main thread writes to better-sqlite3 — the worker never
 *     opens a writable connection.
 *   - `terminate()` awaits the underlying Worker's termination so tests
 *     can call it in `afterEach` without leaking threads.
 */
import { Worker } from 'node:worker_threads';

import type { Logger } from '../../shared/logger.js';
import type { EventBus } from '../ipc/event-bus.js';
import type { JobsDao } from '../db/dao/jobs.js';
import type { JobManagerLike } from '../services/jobs.service.js';

import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './messages.js';

/**
 * Minimal Worker adapter — abstracted so tests can inject an in-process
 * fake without spawning a real thread.
 */
export interface WorkerAdapter {
  postMessage(message: MainToWorkerMessage): void;
  on(event: 'message', handler: (message: WorkerToMainMessage) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  on(event: 'exit', handler: (code: number) => void): void;
  terminate(): Promise<number>;
}

/**
 * Factory that produces a WorkerAdapter. Production wraps a real
 * node:worker_threads Worker; tests provide a fake.
 */
export type WorkerFactory = () => WorkerAdapter;

export interface CreateJobManagerOptions {
  jobsDao: JobsDao;
  eventBus: EventBus;
  logger?: Logger;
  /** Override for the compiled worker script path. */
  workerScriptPath?: string;
  /** Fully custom factory — used by tests. Overrides `workerScriptPath`. */
  workerFactory?: WorkerFactory;
  /** Milliseconds between throttled progress emits per job (default 50). */
  progressThrottleMs?: number;
  /** Injectable id generator so tests can lock ids. */
  idGenerator?: () => string;
}

export interface JobManager extends JobManagerLike {
  /** Convenience helper — start the S2/S3 sample long job. */
  startSampleLongJob(input?: { steps?: number; stepMs?: number }): { jobId: string };
  /** Terminate the worker cleanly. MUST be called in `afterEach` in tests. */
  terminate(): Promise<void>;
  /** Alias for `terminate()` — spec-side name. */
  shutdown(): Promise<void>;
}

interface JobEntry {
  jobId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  lastProgressEmitAt: number;
  pendingProgress?: { pct: number; label: string; timer?: NodeJS.Timeout };
}

function defaultIdGenerator(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `j-${Date.now().toString(36)}-${rand}`;
}

function wrapRealWorker(scriptPath: string): WorkerAdapter {
  const worker = new Worker(scriptPath);
  const adapter: WorkerAdapter = {
    postMessage: (message) => worker.postMessage(message),
    on: ((event: 'message' | 'error' | 'exit', handler: (arg: unknown) => void): void => {
      worker.on(event, handler as (...args: unknown[]) => void);
    }) as WorkerAdapter['on'],
    terminate: () => worker.terminate(),
  };
  return adapter;
}

/**
 * Construct a JobManager wired to `deps`. `deps.workerFactory` takes
 * precedence over `deps.workerScriptPath`; supplying neither uses the
 * default `background.worker.js` path resolution.
 */
export function createJobManager(options: CreateJobManagerOptions): JobManager {
  const { jobsDao, eventBus, logger } = options;
  const throttleMs = options.progressThrottleMs ?? 50;
  const nextId = options.idGenerator ?? defaultIdGenerator;

  const factory: WorkerFactory =
    options.workerFactory ??
    ((): WorkerAdapter => {
      const path = options.workerScriptPath;
      if (!path) {
        throw new Error(
          'createJobManager: workerScriptPath or workerFactory must be provided.',
        );
      }
      return wrapRealWorker(path);
    });

  const jobs = new Map<string, JobEntry>();
  let worker: WorkerAdapter | undefined;
  let terminated = false;

  function ensureWorker(): WorkerAdapter {
    if (worker) {
      return worker;
    }
    const created = factory();
    created.on('message', handleWorkerMessage);
    created.on('error', (err: Error): void => {
      logger?.error('worker error', { errorName: err.name, errorMessage: err.message });
    });
    created.on('exit', (code: number): void => {
      if (code !== 0 && !terminated) {
        logger?.warn('worker exited with non-zero code', { code });
      }
    });
    worker = created;
    return created;
  }

  function emitProgress(entry: JobEntry, pct: number, label: string): void {
    const now = Date.now();
    const elapsed = now - entry.lastProgressEmitAt;
    if (elapsed >= throttleMs) {
      entry.lastProgressEmitAt = now;
      try {
        jobsDao.updateProgress({ id: entry.jobId, progressPct: pct, label });
      } catch (err) {
        logger?.warn('jobsDao.updateProgress failed', {
          jobId: entry.jobId,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
      eventBus.emitJobProgress({ jobId: entry.jobId, pct, label });
      return;
    }
    // Coalesce: replace any pending tick, schedule one for the remaining
    // window if not already pending.
    entry.pendingProgress = { pct, label, timer: entry.pendingProgress?.timer };
    if (entry.pendingProgress.timer === undefined) {
      entry.pendingProgress.timer = setTimeout(() => {
        const pending = entry.pendingProgress;
        entry.pendingProgress = undefined;
        if (!pending) {
          return;
        }
        entry.lastProgressEmitAt = Date.now();
        try {
          jobsDao.updateProgress({
            id: entry.jobId,
            progressPct: pending.pct,
            label: pending.label,
          });
        } catch (err) {
          logger?.warn('jobsDao.updateProgress failed', {
            jobId: entry.jobId,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
        eventBus.emitJobProgress({
          jobId: entry.jobId,
          pct: pending.pct,
          label: pending.label,
        });
      }, Math.max(1, throttleMs - elapsed));
    }
  }

  function clearPending(entry: JobEntry): void {
    if (entry.pendingProgress?.timer) {
      clearTimeout(entry.pendingProgress.timer);
    }
    entry.pendingProgress = undefined;
  }

  function handleWorkerMessage(message: WorkerToMainMessage): void {
    const entry = jobs.get(message.jobId);
    if (!entry) {
      return;
    }
    switch (message.type) {
      case 'started': {
        entry.status = 'running';
        try {
          jobsDao.updateStatus({ id: message.jobId, status: 'running' });
        } catch (err) {
          logger?.warn('jobsDao.updateStatus(running) failed', {
            jobId: message.jobId,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }
      case 'progress': {
        if (entry.status === 'cancelled') {
          // Silently drop late progress after a cancel.
          return;
        }
        emitProgress(entry, message.pct, message.label);
        break;
      }
      case 'done': {
        clearPending(entry);
        entry.status = 'succeeded';
        try {
          jobsDao.updateStatus({
            id: message.jobId,
            status: 'succeeded',
            result: safeStringify(message.result),
          });
        } catch (err) {
          logger?.warn('jobsDao.updateStatus(succeeded) failed', {
            jobId: message.jobId,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
        eventBus.emitJobDone({ jobId: message.jobId, result: message.result });
        jobs.delete(message.jobId);
        break;
      }
      case 'error': {
        clearPending(entry);
        const isCancel = message.error.code === 'cancelled';
        entry.status = isCancel ? 'cancelled' : 'failed';
        try {
          if (isCancel) {
            jobsDao.cancelById(message.jobId, message.error.message);
          } else {
            jobsDao.updateStatus({
              id: message.jobId,
              status: 'failed',
              error: message.error.message,
            });
          }
        } catch (err) {
          logger?.warn('jobsDao terminal-update failed', {
            jobId: message.jobId,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
        eventBus.emitJobDone({ jobId: message.jobId, error: message.error });
        if (isCancel) {
          eventBus.emitJobCancelled({
            jobId: message.jobId,
            reason: message.error.message,
          });
        }
        jobs.delete(message.jobId);
        break;
      }
      default: {
        const _exhaustive: never = message;
        void _exhaustive;
      }
    }
  }

  function startJob(kind: string, input: unknown): { jobId: string } {
    if (terminated) {
      throw new Error('JobManager is terminated');
    }
    const jobId = nextId();
    // Persist the pending row synchronously BEFORE returning so a crash
    // between here and worker acknowledgement leaves a recoverable row.
    jobsDao.insert({ id: jobId, kind, status: 'pending' });
    jobs.set(jobId, {
      jobId,
      status: 'pending',
      lastProgressEmitAt: 0,
    });
    const w = ensureWorker();
    w.postMessage({ type: 'start', jobId, kind, input });
    return { jobId };
  }

  function cancelJob(jobId: string): void {
    const entry = jobs.get(jobId);
    if (!entry) {
      return;
    }
    entry.status = 'cancelled';
    clearPending(entry);
    if (worker) {
      worker.postMessage({ type: 'cancel', jobId });
    }
  }

  async function terminate(): Promise<void> {
    if (terminated) {
      return;
    }
    terminated = true;
    for (const entry of jobs.values()) {
      clearPending(entry);
    }
    if (worker) {
      try {
        worker.postMessage({ type: 'shutdown' });
      } catch {
        // Worker may already be dead — best-effort.
      }
      try {
        await worker.terminate();
      } catch (err) {
        logger?.warn('worker terminate failed', {
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
      worker = undefined;
    }
    jobs.clear();
  }

  return {
    startJob,
    cancelJob,
    startSampleLongJob: (input) => startJob('sample-long-job', input ?? {}),
    terminate,
    shutdown: terminate,
  };
}

/** JSON-stringify safely; falls back to `undefined` on cycles. */
function safeStringify(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
