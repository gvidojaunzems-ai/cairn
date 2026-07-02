/**
 * Forward-only migration runner.
 *
 * Business rules:
 *   - Reads and writes the schema version via SQLite's built-in
 *     `PRAGMA user_version` (a single 32-bit int in the DB header). No
 *     separate schema_version table is needed and no join is required to
 *     read it — the pragma is atomic against a running transaction.
 *   - Every migration runs inside a single BEGIN…COMMIT. If `up()` throws,
 *     the runner ROLLBACKs and rethrows so the caller sees the original
 *     error and the DB is left at the last successful version.
 *   - Before applying ANY pending migration, the runner performs
 *     `PRAGMA wal_checkpoint(TRUNCATE)` and copies cairn.db to a
 *     timestamped backup — this is the recovery path if a migration
 *     corrupts the file mid-flight (which itself is very unlikely given
 *     the transactional apply, but defence-in-depth).
 *   - When `db.schema_version > code.schema_version`, the runner refuses to
 *     open the DB with a clear human-readable error and runs
 *     `PRAGMA integrity_check` on the rejection path so the caller can
 *     log whether the DB is at least structurally sound.
 *   - `MIGRATIONS` must be sequential (1, 2, 3, …) and gap-free — enforced
 *     at construction time so a mis-registered migration surfaces as a
 *     startup error rather than a silent skip.
 */
import type Database from 'better-sqlite3';
import { copyFileSync, existsSync } from 'node:fs';

import { createLogger } from '../../../shared/logger.js';
import { CODE_SCHEMA_VERSION, BACKUP_FILE_PREFIX } from '../schema.js';
import { MIGRATIONS, type Migration } from './index.js';

const logger = createLogger('db.migrations');

/**
 * Error thrown when the on-disk DB was created by a newer build of Cairn.
 * The runner attaches an integrity-check result so the caller can decide
 * whether to keep the file or restore a backup.
 */
export class NewerSchemaVersionError extends Error {
  public readonly dbSchemaVersion: number;
  public readonly codeSchemaVersion: number;
  public readonly integrityCheck: string;

  constructor(dbVersion: number, codeVersion: number, integrityCheck: string) {
    super(
      `cairn.db was created by a newer build of Cairn (schema v${String(dbVersion)}). ` +
        `This build only supports schema v${String(codeVersion)}. ` +
        `Please upgrade Cairn or restore a compatible backup.`,
    );
    this.name = 'NewerSchemaVersionError';
    this.dbSchemaVersion = dbVersion;
    this.codeSchemaVersion = codeVersion;
    this.integrityCheck = integrityCheck;
  }
}

export interface RunMigrationsOptions {
  /**
   * Absolute path to the DB file on disk. Required so the runner can copy
   * cairn.db to `<path>.<timestamp>.bak` before applying migrations. If
   * omitted (e.g. `:memory:` DBs used in tests), the backup step is
   * skipped.
   */
  dbPath?: string;
  /** Override the migration registry (used by tests). */
  migrations?: readonly Migration[];
  /** Override the maximum schema version this build claims to know. */
  codeSchemaVersion?: number;
}

/**
 * Read the current schema version stored in the DB header.
 */
export function readDbSchemaVersion(db: Database.Database): number {
  return Number(db.pragma('user_version', { simple: true }));
}

/**
 * Assert the migration list is sequential from 1..N with no gaps and no
 * out-of-order entries. Throws with a specific message so a mis-registered
 * migration is easy to diagnose.
 */
function assertSequential(migrations: readonly Migration[]): void {
  for (let index = 0; index < migrations.length; index += 1) {
    const expected = index + 1;
    const actual = migrations[index]?.version;
    if (actual !== expected) {
      throw new Error(
        `Migration registry is not sequential: expected version ${String(expected)} at index ${String(index)}, got ${String(actual)}.`,
      );
    }
  }
}

/**
 * Produce a filesystem-safe timestamp suffix (no colons — Windows-hostile).
 */
function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Checkpoint the WAL and copy the DB file to a timestamped backup. Best-
 * effort — if the source file doesn't exist yet (first run), nothing is
 * copied.
 */
function backupDatabase(db: Database.Database, dbPath: string | undefined): string | null {
  if (typeof dbPath !== 'string' || dbPath.length === 0 || !existsSync(dbPath)) {
    return null;
  }
  // TRUNCATE mode collapses the WAL back into the main DB so the copy is a
  // full snapshot rather than "main + separate WAL tail".
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Some journal modes (e.g. :memory:) reject wal_checkpoint — safe to
    // continue.
  }
  const backupPath = `${dbPath}.${timestampSuffix()}.${BACKUP_FILE_PREFIX}`;
  copyFileSync(dbPath, backupPath);
  return backupPath;
}

/**
 * Apply a single migration inside its own transaction. On failure, ROLLBACK
 * and rethrow the original error so the runner can report which version
 * failed.
 */
function applyOne(db: Database.Database, migration: Migration): void {
  db.exec('BEGIN');
  try {
    migration.up(db);
    // Interpolating `migration.version` is safe: it is a compile-time
    // integer sourced from the migration registry, never user input.
    db.exec(`PRAGMA user_version = ${String(migration.version)}`);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ROLLBACK can fail if the txn was already implicitly aborted.
    }
    throw error;
  }
}

/**
 * Run all pending migrations against `db`. Refuses to run when the DB is at
 * a higher schema version than this build knows about.
 */
export function runMigrations(db: Database.Database, options: RunMigrationsOptions = {}): number {
  const migrations = options.migrations ?? MIGRATIONS;
  const codeVersion = options.codeSchemaVersion ?? CODE_SCHEMA_VERSION;
  assertSequential(migrations);

  const dbVersion = readDbSchemaVersion(db);
  if (dbVersion > codeVersion) {
    const integrity = String(db.pragma('integrity_check', { simple: true }));
    throw new NewerSchemaVersionError(dbVersion, codeVersion, integrity);
  }
  if (dbVersion === codeVersion) {
    return dbVersion;
  }

  const pending = migrations.filter((m) => m.version > dbVersion);
  if (pending.length === 0) {
    return dbVersion;
  }

  const backupPath = backupDatabase(db, options.dbPath);
  if (backupPath !== null) {
    logger.info('pre-migration backup created', { path: backupPath });
  }

  for (const migration of pending) {
    logger.info('applying migration', {
      version: migration.version,
      description: migration.description,
    });
    applyOne(db, migration);
  }

  return readDbSchemaVersion(db);
}
