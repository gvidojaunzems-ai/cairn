/**
 * Job kind → runner registry.
 *
 * Business rules:
 *   - The registry is intentionally small — each entry is a function
 *     that receives `(input, callbacks)` and resolves with a serialisable
 *     result. New kinds land as new entries here.
 *   - Runners MUST NOT open a writable better-sqlite3 handle — the main
 *     thread owns writes. If a runner needs to read, it opens its own
 *     read-only connection (out of scope for the sample job).
 */
import {
  runSampleLongJob,
  type SampleLongJobCallbacks,
  type SampleLongJobOptions,
} from './sample-long-job.js';

/** Callbacks every runner receives. */
export interface JobRunnerCallbacks {
  onProgress(pct: number, label: string): void;
  isCancelled(): boolean;
}

/** Signature of a job runner. */
export type JobRunner = (
  input: unknown,
  callbacks: JobRunnerCallbacks,
) => Promise<unknown>;

/**
 * The kind → runner map. Kept as a plain record so worker code can look
 * up `runners[kind]` without imports at call time.
 */
export const JOB_RUNNERS: Readonly<Record<string, JobRunner>> = {
  'sample-long-job': async (
    input: unknown,
    callbacks: JobRunnerCallbacks,
  ): Promise<unknown> => {
    const opts = (input ?? {}) as SampleLongJobOptions;
    const cbs: SampleLongJobCallbacks = {
      onProgress: callbacks.onProgress,
      isCancelled: callbacks.isCancelled,
    };
    return runSampleLongJob(opts, cbs);
  },
};

/** Retrieve a runner by kind. Returns `undefined` when the kind is unknown. */
export function getJobRunner(kind: string): JobRunner | undefined {
  return JOB_RUNNERS[kind];
}
