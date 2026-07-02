/**
 * Barrel export for the DAO layer. Keeps consumer imports short and hides
 * per-DAO file paths so future refactors (e.g. splitting a DAO across
 * several files) do not ripple outwards.
 */
export type {
  InsertJobInput,
  JobsDao,
  UpdateJobProgressInput,
  UpdateJobStatusInput,
} from './jobs.dao.js';
export { createJobsDao } from './jobs.dao.js';
