/**
 * `jobs.*` service — background job control plane.
 *
 * Business rules:
 *   - This is the ONLY namespace whose operations have real semantics
 *     alongside `system.*` — it drives the worker-thread job manager.
 *   - When no `JobManager` is provided (e.g. during a lightweight unit
 *     test) every op returns `not_implemented` gracefully.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import type { JobHandle, JobIdInput, StartJobInput } from '../../shared/ipc/operations.js';
import { errResult, makeError, notImplementedResult, okResult } from '../ipc/errors.js';

/** Minimal contract expected of the injected `JobManager`. */
export interface JobManagerLike {
  startJob(kind: string, input: unknown): { jobId: string };
  cancelJob(jobId: string): void;
}

export interface JobsService {
  start(input: StartJobInput): CoreServiceResult<JobHandle>;
  cancel(input: JobIdInput): CoreServiceResult<Record<string, never>>;
  status(input: JobIdInput): CoreServiceResult<never>;
}

/**
 * Build a jobs service backed by `manager`. When `manager` is undefined,
 * every op returns `not_implemented` so callers can wire this early in
 * bootstrap before the worker is ready.
 */
export function createJobsService(manager?: JobManagerLike): JobsService {
  return {
    start: (input) => {
      if (!manager) {
        return notImplementedResult('jobs.start');
      }
      try {
        const handle = manager.startJob(input.kind, input.input);
        return okResult(handle);
      } catch (err) {
        return errResult(
          makeError(
            'internal',
            err instanceof Error ? err.message : 'Failed to start job',
          ),
        );
      }
    },
    cancel: (input) => {
      if (!manager) {
        return notImplementedResult('jobs.cancel');
      }
      try {
        manager.cancelJob(input.jobId);
        return okResult({});
      } catch (err) {
        return errResult(
          makeError(
            'internal',
            err instanceof Error ? err.message : 'Failed to cancel job',
          ),
        );
      }
    },
    status: (_input) => notImplementedResult('jobs.status'),
  };
}

/** Default (no-manager) singleton — replaced in bootstrap once the worker is ready. */
export const jobsService: JobsService = createJobsService();
