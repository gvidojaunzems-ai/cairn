/**
 * Migration 001 — initial schema baseline.
 *
 * Establishes the migrations-tracking table itself and marks the DB as
 * "version 1" so subsequent migrations (002+) have a stable prior state to
 * upgrade from.
 *
 * Idempotency: the `IF NOT EXISTS` guards mean re-running this migration on
 * an already-initialised DB is a no-op — the migration runner still uses the
 * `schema_migrations` row to short-circuit before we reach this file, but
 * defence in depth is cheap.
 */
import type { Database } from 'better-sqlite3';

import type { Migration } from './index.js';

export const migration001Initial: Migration = {
  version: 1,
  name: '001-initial',
  up(db: Database): void {
    // The migrations-tracking table records every migration that has been
    // applied to this DB, keyed by version. `applied_at` is stored as UNIX
    // epoch milliseconds to match `JobsTableRow.createdAt` conventions.
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);
  },
};
