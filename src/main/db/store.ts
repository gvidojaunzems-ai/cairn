/**
 * High-level local store opener.
 *
 * Wraps `openDatabase` and bundles the raw handle with DAOs that share the
 * same connection. This is the preferred entry point for code that needs
 * both the database handle and the jobs DAO.
 */
import type Database from 'better-sqlite3';

import { openDatabase, type OpenDatabaseOptions } from './connection.js';
import { createJobsDao, type JobsDao } from './dao/jobs.js';

export interface LocalStoreHandle {
  db: Database.Database;
  jobsDao: JobsDao;
  close(): void;
}

export type OpenStoreOptions = OpenDatabaseOptions;

/**
 * Open `cairn.db`, run migrations, and return a handle with the jobs DAO.
 * Callers must invoke `close()` at shutdown.
 */
export function openStore(options: OpenStoreOptions = {}): LocalStoreHandle {
  const db = openDatabase(options);
  const jobsDao = createJobsDao(db);

  let closed = false;
  return {
    db,
    jobsDao,
    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      db.close();
    },
  };
}
