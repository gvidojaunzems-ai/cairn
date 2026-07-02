/**
 * `jobs.*` service — background job control plane.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import type { JobHandle, JobIdInput, StartJobInput } from '../../shared/ipc/operations.js';
import { errResult, makeError, notImplementedResult, okResult } from '../ipc/errors.js';
import type { JobsDao } from '../db/dao/jobs.js';

/** Minimal contract expected of the injected `JobManager`. */
export interface JobManagerLike {
  startJob(kind: string, input: unknown): { jobId: string };
  cancelJob(jobId: string): void;
}

export interface JobsService {
  start(input: StartJobInput): CoreServiceResult<JobHandle>;
  cancel(input: JobIdInput): CoreServiceResult<Record<string, never>>;
  status(input: JobIdInput): CoreServiceResult<{
    jobId: string;
    kind: string;
    status: string;
    progressPct: number;
    label: string | null;
  }>;
}

export function createJobsService(
  manager?: JobManagerLike,
  jobsDao?: JobsDao,
): JobsService {
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
          makeError('internal', err instanceof Error ? err.message : 'Failed to start job'),
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
          makeError('internal', err instanceof Error ? err.message : 'Failed to cancel job'),
        );
      }
    },
    status: (input) => {
      if (!jobsDao) {
        return notImplementedResult('jobs.status');
      }
      const job = jobsDao.getById(input.jobId);
      if (job === undefined) {
        return errResult(makeError('not_found', `Job not found: ${input.jobId}`));
      }
      return okResult({
        jobId: job.id,
        kind: job.kind,
        status: job.status,
        progressPct: job.progressPct ?? 0,
        label: job.label ?? null,
      });
    },
  };
}

/** Default (no-manager) singleton — replaced in bootstrap once the worker is ready. */
export const jobsService: JobsService = createJobsService();
