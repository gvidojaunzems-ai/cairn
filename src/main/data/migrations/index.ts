/**
 * Migration runner for the on-disk local store (better-sqlite3).
 *
 * Business rules:
 *   - Idempotent by design: calling `runMigrations(db)` twice on the same DB
 *     applies each migration at most once. The `schema_migrations` table
 *     records applied versions; migrations execute inside a transaction so a
 *     partially-applied upgrade rolls back cleanly.
 *   - Migrations are declarative `Migration` records — `up(db)` gets a live
 *     `better-sqlite3` handle and must use prepared statements or `db.exec`
 *     with static SQL. No string-concatenated user input.
 *   - Ordering: migrations execute in ascending `version` order. The runner
 *     rejects a gap (e.g. only 001 + 003 registered) to catch missing
 *     migrations at boot rather than at first failure.
 *
 * Log via `src/shared/logger.ts` — never `console.log` — so migration events
 * flow into the structured log stream alongside the rest of the app.
 */
import type { Database } from 'better-sqlite3';

import { createLogger } from '../../../shared/logger.js';
import { migration001Initial } from './001-initial.js';
import { migration002JobsTable } from './002-jobs-table.js';

const log = createLogger('data.migrations');

/**
 * A single migration step. `up` mutates the DB in place. Every migration is
 * wrapped in a transaction by the runner, so `up` should not open its own.
 */
export interface Migration {
  /** Monotonically-increasing version number; matches LocalStoreSchema.version once fully applied. */
  version: number;
  /** Human-readable name used in logs and the migrations-tracking table. */
  name: string;
  /** Apply the migration against `db`. Throw to abort (rollback). */
  up(db: Database): void;
}

/**
 * Ordered list of every migration in this app. Extend by appending — never
 * reorder or renumber existing entries. See ADR 0004.
 */
export const ALL_MIGRATIONS: readonly Migration[] = Object.freeze([
  migration001Initial,
  migration002JobsTable,
]);

interface AppliedVersionRow {
  version: number;
}

/**
 * Load the set of already-applied migration versions from the tracking
 * table. Returns an empty set when the table has not yet been created
 * (first-boot path).
 */
function loadAppliedVersions(db: Database): Set<number> {
  // `sqlite_master` is queryable without CREATE — this lets us branch before
  // the tracking table exists.
  const trackingRow = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get() as { name: string } | undefined;
  if (trackingRow === undefined) {
    return new Set<number>();
  }
  const rows = db
    .prepare('SELECT version FROM schema_migrations')
    .all() as AppliedVersionRow[];
  return new Set(rows.map((row) => row.version));
}

/**
 * Validate that migration versions form a contiguous sequence starting at 1.
 * A gap is almost always a bug (missed rebase, forgotten file) so we fail
 * loudly rather than silently skipping.
 */
function assertContiguousVersions(migrations: readonly Migration[]): void {
  for (let index = 0; index < migrations.length; index += 1) {
    const expected = index + 1;
    const actual = migrations[index]?.version;
    if (actual !== expected) {
      throw new Error(
        `Migration list is not contiguous: expected version ${String(expected)} at position ${String(index)}, got ${String(actual)}`,
      );
    }
  }
}

/**
 * Apply every registered migration that has not yet been applied to `db`.
 *
 * Returns the number of migrations actually executed on this call. Safe to
 * call repeatedly — subsequent calls after a full upgrade are no-ops (return
 * 0).
 */
export function runMigrations(
  db: Database,
  migrations: readonly Migration[] = ALL_MIGRATIONS,
): number {
  assertContiguousVersions(migrations);
  const applied = loadAppliedVersions(db);

  let appliedThisRun = 0;
  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }
    // Wrap each migration in its own transaction so a mid-flight failure
    // does not leave the DB in a half-migrated state. The INSERT is
    // prepared inside the transaction so the first-boot ordering — where
    // migration 001 creates `schema_migrations` before we insert into it —
    // holds even on the very first call.
    const runner = db.transaction(() => {
      migration.up(db);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (@version, @name, @appliedAt)',
      ).run({
        version: migration.version,
        name: migration.name,
        appliedAt: Date.now(),
      });
    });
    runner();
    log.info('applied migration', {
      version: migration.version,
      name: migration.name,
    });
    appliedThisRun += 1;
  }
  if (appliedThisRun === 0) {
    log.debug('migrations up-to-date', { totalRegistered: migrations.length });
  }
  return appliedThisRun;
}
