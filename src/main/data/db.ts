/**
 * Local-store opener.
 *
 * Business rules:
 *   - The DB file lives under `resolvePaths().data/cairn.sqlite` — never at a
 *     hard-coded path. Callers may override for tests via `openLocalStore({
 *     filePath })`.
 *   - Single-writer discipline: only the Electron main thread opens a
 *     writable connection. A worker_thread that needs data must go through
 *     an IPC message queue back to the main thread — do NOT open a second
 *     writable Database from a worker. See ADR 0004.
 *   - WAL mode is enabled at open time (`journal_mode = WAL`) for better
 *     read/write concurrency, and `foreign_keys` is turned ON (SQLite
 *     defaults it OFF — we want referential integrity for future tables).
 *   - Migrations run inside `openLocalStore` idempotently — first-boot and
 *     already-upgraded DBs both take the same path.
 *
 * Log via `src/shared/logger.ts` — never `console.log`.
 */
import Database from 'better-sqlite3';
import type { Database as DatabaseInstance } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createLogger } from '../../shared/logger.js';
import { resolvePaths } from '../../shared/paths.js';
import type { JobsDao } from './dao/index.js';
import { createJobsDao } from './dao/index.js';
import { runMigrations } from './migrations/index.js';

const log = createLogger('data.db');

/**
 * Default filename for the local store. Kept as an exported constant so
 * tests and diagnostic scripts share one source of truth.
 */
export const LOCAL_STORE_FILE_NAME = 'cairn.sqlite';

export interface OpenLocalStoreOptions {
  /**
   * Absolute path to the SQLite file. Defaults to
   * `resolvePaths().data/cairn.sqlite`. Tests pass a temp path.
   */
  filePath?: string;
}

/**
 * Handle bundle returned by `openLocalStore`. Callers get the raw `db` for
 * read paths (e.g. ad-hoc SELECTs), the `jobsDao` for job lifecycle writes,
 * and `close()` to release the native handle on shutdown.
 */
export interface LocalStoreHandle {
  db: DatabaseInstance;
  jobsDao: JobsDao;
  /** Close the underlying native handle. Safe to call more than once. */
  close(): void;
}

/**
 * Resolve the default DB path under `resolvePaths().data`. Kept in its own
 * helper so `openLocalStore` stays readable.
 */
function defaultDbFilePath(): string {
  return join(resolvePaths().data, LOCAL_STORE_FILE_NAME);
}

/**
 * Ensure the DB's parent directory exists before better-sqlite3 tries to
 * open the file. `recursive: true` makes this idempotent.
 */
function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

/**
 * Apply the pragmas we rely on for every open. Kept as its own helper so
 * tests can assert the pragmas via `db.pragma('journal_mode')` etc.
 */
function applyStartupPragmas(db: DatabaseInstance): void {
  // WAL improves read concurrency and reduces write-lock contention. The
  // trade-off (extra `-wal` / `-shm` sidecar files) is acceptable for a
  // desktop local store.
  db.pragma('journal_mode = WAL');
  // FK enforcement is OFF by default in SQLite for backward compatibility.
  // We turn it ON so future FK constraints actually behave like FKs.
  db.pragma('foreign_keys = ON');
}

/**
 * Open (or create) the local store, apply pragmas, run pending migrations,
 * and return a handle with the raw DB plus each DAO.
 *
 * Idempotent: calling `openLocalStore()` twice returns two independent
 * handles; migrations are only applied to a given file once regardless of
 * how many times it is opened. See `runMigrations` for details.
 */
export function openLocalStore(
  options: OpenLocalStoreOptions = {},
): LocalStoreHandle {
  const filePath = options.filePath ?? defaultDbFilePath();
  ensureParentDir(filePath);

  const db = new Database(filePath);
  try {
    applyStartupPragmas(db);
    const applied = runMigrations(db);
    log.info('local store opened', {
      filePath,
      migrationsAppliedThisRun: applied,
    });
  } catch (error) {
    // If startup fails, don't leak the native handle.
    db.close();
    throw error;
  }

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
