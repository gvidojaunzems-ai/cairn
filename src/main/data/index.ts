/**
 * Barrel export for the main-process data layer.
 *
 * Consumers import from `@main/data` and get the local-store opener plus
 * every DAO surface without knowing internal file layout.
 */
export type { LocalStoreHandle, OpenLocalStoreOptions } from './db.js';
export { LOCAL_STORE_FILE_NAME, openLocalStore } from './db.js';
export type {
  InsertJobInput,
  JobsDao,
  UpdateJobProgressInput,
  UpdateJobStatusInput,
} from './dao/index.js';
export { createJobsDao } from './dao/index.js';
export type { Migration } from './migrations/index.js';
export { ALL_MIGRATIONS, runMigrations } from './migrations/index.js';
