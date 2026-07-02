/**
 * Migration 002 — jobs table.
 *
 * Creates the `jobs` table that persists background-worker job lifecycle so
 * long-running work can survive process restarts. Column layout mirrors the
 * `JobsTableRow` interface in `src/contracts/local-store.contract.ts`
 * (schema v2). See ADR 0004 for the schema-bump rationale.
 *
 * Columns:
 *   - id           TEXT PRIMARY KEY  — job manager assigned identifier.
 *   - kind         TEXT NOT NULL     — routing tag for the runner.
 *   - status       TEXT NOT NULL     — one of `JobStatus` values; CHECKed.
 *   - created_at   INTEGER NOT NULL  — epoch ms.
 *   - updated_at   INTEGER NOT NULL  — epoch ms.
 *   - progress_pct INTEGER           — optional 0..100.
 *   - label        TEXT              — optional display label.
 *   - result       TEXT              — optional JSON-serialised result.
 *   - error        TEXT              — optional user-safe error message.
 *
 * Indexes:
 *   - idx_jobs_status_updated_at supports the "list pending jobs" query
 *     (WHERE status = 'pending' ORDER BY updated_at) executed on boot to
 *     recover in-flight work.
 */
import type { Database } from 'better-sqlite3';

import type { Migration } from './index.js';

export const migration002JobsTable: Migration = {
  version: 2,
  name: '002-jobs-table',
  up(db: Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        progress_pct INTEGER,
        label TEXT,
        result TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status_updated_at
        ON jobs (status, updated_at);
    `);
  },
};
