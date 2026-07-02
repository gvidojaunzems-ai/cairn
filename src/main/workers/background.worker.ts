/**
 * Background worker — spawned from the main process via
 * `node:worker_threads` and receives `MainToWorkerMessage`s over the
 * parent port.
 *
 * Business rules:
 *   - Every incoming `{type:'start'}` looks up a runner in
 *     `job-registry.ts` and executes it, posting progress back as
 *     `{type:'progress'}` and terminal state as `{type:'done'}` or
 *     `{type:'error'}`.
 *   - Cancellation flips a per-jobId flag; runners poll it via
 *     `isCancelled()`. Cancelled jobs surface as `{type:'error',
 *     error:{code:'cancelled'}}`.
 *   - The worker NEVER opens a writable better-sqlite3 connection. It
 *     communicates job state only via `postMessage`; the main thread
 *     serialises every write to `jobs`.
 */
import { parentPort } from 'node:worker_threads';

import { getJobRunner } from '../jobs/job-registry.js';
import type {
  DoneMessage,
  ErrorMessage,
  MainToWorkerMessage,
  ProgressMessage,
  StartedMessage,
} from '../jobs/messages.js';

/** Per-jobId cancellation flag map. */
const cancelled = new Map<string, boolean>();

function post(
  message: StartedMessage | ProgressMessage | DoneMessage | ErrorMessage,
): void {
  parentPort?.postMessage(message);
}

async function handleStart(
  jobId: string,
  kind: string,
  input: unknown,
): Promise<void> {
  post({ type: 'started', jobId });
  const runner = getJobRunner(kind);
  if (!runner) {
    post({
      type: 'error',
      jobId,
      error: { code: 'not_found', message: `Unknown job kind: ${kind}` },
    });
    return;
  }
  try {
    const result = await runner(input, {
      onProgress: (pct: number, label: string): void => {
        // Skip late progress ticks if a cancel already landed.
        if (cancelled.get(jobId) === true) {
          return;
        }
        post({ type: 'progress', jobId, pct, label });
      },
      isCancelled: (): boolean => cancelled.get(jobId) === true,
    });
    if (cancelled.get(jobId) === true) {
      post({
        type: 'error',
        jobId,
        error: { code: 'cancelled', message: 'Job cancelled by user.' },
      });
      return;
    }
    post({ type: 'done', jobId, result });
  } catch (err: unknown) {
    // Preserve typed cancellation errors from runners.
    if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
      const asError = err as { code: unknown; message: unknown };
      if (
        typeof asError.code === 'string' &&
        typeof asError.message === 'string'
      ) {
        post({
          type: 'error',
          jobId,
          error: { code: asError.code, message: asError.message },
        });
        return;
      }
    }
    const summary =
      err instanceof Error
        ? (err.message.split('\n', 1)[0] ?? 'Unknown error')
        : 'Unknown error';
    post({
      type: 'error',
      jobId,
      error: { code: 'internal', message: summary },
    });
  } finally {
    cancelled.delete(jobId);
  }
}

/**
 * Message handler. Exported so an in-process test can drive the worker
 * without spawning a real thread.
 */
export function handleMessage(message: MainToWorkerMessage): void {
  switch (message.type) {
    case 'start':
      void handleStart(message.jobId, message.kind, message.input);
      break;
    case 'cancel':
      cancelled.set(message.jobId, true);
      break;
    case 'shutdown':
      // The main-thread manager terminates the worker; this handler is
      // effectively a no-op but exists to make the union exhaustive.
      break;
    default: {
      const _exhaustive: never = message;
      void _exhaustive;
    }
  }
}

// When executed as a real worker_thread, wire the parent port to the
// handler. Guarded so importing the file in a unit test does not throw.
if (parentPort) {
  parentPort.on('message', (raw: unknown) => {
    handleMessage(raw as MainToWorkerMessage);
  });
}
