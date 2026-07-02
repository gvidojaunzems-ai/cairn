/**
 * Sample long-running job used as the permanent S2/S3 fixture.
 *
 * Business rules:
 *   - This is a PRODUCTION fixture (permanent), NOT a test-only helper. It
 *     lives here so the runtime `kind='sample-long-job'` is reachable
 *     through the real `jobs.start` op.
 *   - `runSampleLongJob` emits progress at fixed intervals so S2 can
 *     assert "at least one job.progress then job.done".
 *   - Cancellation is polled between steps via `isCancelled()`; when true,
 *     the runner throws a typed `{code:'cancelled'}` object so the
 *     manager can surface `job.done{error:{code:'cancelled'}}`. No further
 *     progress events follow.
 */

/** Public options for `runSampleLongJob`. */
export interface SampleLongJobOptions {
  /** Number of progress ticks (default 5). */
  steps?: number;
  /** Milliseconds between ticks (default 20). */
  stepMs?: number;
}

/** Callbacks the runner invokes as it makes progress. */
export interface SampleLongJobCallbacks {
  onProgress(pct: number, label: string): void;
  /** Poll for cancellation between steps. Returning true aborts the job. */
  isCancelled(): boolean;
}

/** Result payload for successful completion. */
export interface SampleLongJobResult {
  completed: true;
  steps: number;
}

/**
 * Thrown when `isCancelled()` returns true mid-flight. The manager
 * catches this shape and surfaces `job.done{error:{code:'cancelled'}}`.
 */
export interface CancelledError {
  code: 'cancelled';
  message: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Execute the sample long job. Emits `steps` progress ticks, then
 * resolves with the completion result. Cancellation between steps
 * throws a `CancelledError`.
 */
export async function runSampleLongJob(
  options: SampleLongJobOptions,
  callbacks: SampleLongJobCallbacks,
): Promise<SampleLongJobResult> {
  const steps = Math.max(1, options.steps ?? 5);
  const stepMs = Math.max(0, options.stepMs ?? 20);

  for (let index = 1; index <= steps; index += 1) {
    if (callbacks.isCancelled()) {
      const cancelled: CancelledError = {
        code: 'cancelled',
        message: 'Sample long job cancelled by user.',
      };
      throw cancelled;
    }
    // Wait BEFORE the tick so a fast cancel between start and first
    // progress event is honored without emitting a spurious tick first.
    if (stepMs > 0) {
      await delay(stepMs);
    }
    if (callbacks.isCancelled()) {
      const cancelled: CancelledError = {
        code: 'cancelled',
        message: 'Sample long job cancelled by user.',
      };
      throw cancelled;
    }
    const pct = Math.round((index / steps) * 100);
    callbacks.onProgress(pct, `Step ${index} of ${steps}`);
  }

  return { completed: true, steps };
}
