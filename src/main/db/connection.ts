/**
 * Cairn embedded-store connection factory.
 *
 * Business rules:
 *   - The DB file lives at `join(resolvePaths().data, 'cairn.db')` — never
 *     hard-coded. Tests can override the base directory via the `dataDir`
 *     option, but production callers always go through `resolvePaths()`.
 *   - Every connection enables `PRAGMA foreign_keys = ON` — better-sqlite3
 *     inherits SQLite's default of OFF, so this must be set per-connection.
 *   - The sqlite-vec loadable extension is loaded via
 *     `getLoadablePath()` from the `sqlite-vec` package. If the extension
 *     fails to load, `openDatabase` throws — the store is unusable without
 *     it and silent fallback would give AI/search components misleading
 *     "top-k returned 0" behaviour.
 *   - `openDatabase` runs the migration runner as its final step so callers
 *     always receive a DB that is either at the current code schema version
 *     or has thrown a clear human-readable error.
 */
import Database from 'better-sqlite3';
import { getLoadablePath } from 'sqlite-vec';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { resolvePaths } from '../../shared/paths.js';
import { createLogger } from '../../shared/logger.js';
import { runMigrations } from './migrations/runner.js';
import { DB_FILE_NAME } from './schema.js';

const logger = createLogger('db.connection');

export interface OpenDatabaseOptions {
  /** Override the base data directory (used by tests). */
  dataDir?: string;
  /** Override the DB file name (used by tests). */
  fileName?: string;
  /**
   * When true, `openDatabase` skips the migration runner. Only intended for
   * tests that want to inspect a raw (pre-migration) handle.
   */
  skipMigrations?: boolean;
  /**
   * When true, skip loading sqlite-vec. Only for tests that exercise non-vector
   * tables (e.g. jobs DAO) without requiring the native extension.
   */
  skipSqliteVec?: boolean;
}

/**
 * Return the absolute path where cairn.db lives, honoring per-OS conventions.
 * Exported so tests can compute the expected path without duplicating the
 * `resolvePaths()` / `join(...)` logic.
 */
export function resolveDatabasePath(options: OpenDatabaseOptions = {}): string {
  const dataDir = options.dataDir ?? resolvePaths().data;
  const fileName = options.fileName ?? DB_FILE_NAME;
  return join(dataDir, fileName);
}

/**
 * Ensure the parent directory of `dbPath` exists. Callers usually go through
 * `createDirectories(resolvePaths())` at bootstrap, but we double-check so
 * `openDatabase` never fails with ENOENT for a missing data directory.
 */
function ensureParentDir(dbPath: string): void {
  const dir = dbPath.replace(/[\\/][^\\/]+$/, '');
  if (dir.length > 0 && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load the sqlite-vec loadable extension against `db`. Extracted so the
 * migration runner can also load it before re-checking a rejected DB.
 */
export function loadSqliteVec(db: Database.Database): void {
  const path = getLoadablePath();
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(
      'sqlite-vec did not resolve a loadable-extension path — is a prebuilt binary available for this platform/arch?',
    );
  }
  db.loadExtension(path);
}

/**
 * Open the Cairn local store, load the sqlite-vec extension, enable foreign
 * keys, and run the migration runner. Returns a live better-sqlite3 handle.
 *
 * Callers are responsible for calling `db.close()` at shutdown.
 */
export function openDatabase(options: OpenDatabaseOptions = {}): Database.Database {
  const dbPath = resolveDatabasePath(options);
  ensureParentDir(dbPath);

  const db = new Database(dbPath);
  try {
    // WAL for concurrent reader/writer robustness — the migration runner
    // additionally issues `PRAGMA wal_checkpoint(TRUNCATE)` before backing
    // the file up so the copy is a full snapshot.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    if (options.skipSqliteVec !== true) {
      loadSqliteVec(db);
    }

    if (options.skipMigrations !== true) {
      runMigrations(db, { dbPath });
    }

    logger.info('database opened', { path: dbPath, version: db.pragma('user_version', { simple: true }) });
    return db;
  } catch (error) {
    // Ensure we release the OS handle before rethrowing so the caller can
    // retry / restore a backup without hitting EBUSY on the file.
    try {
      db.close();
    } catch {
      // best-effort
    }
    throw error;
  }
}
