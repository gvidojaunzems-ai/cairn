/**
 * Migration 0002 — jobs table (ADR 0004).
 *
 * Creates the `jobs` table that persists background-worker job lifecycle.
 * Column layout mirrors `JobsTableRow` in `src/contracts/local-store.contract.ts`.
 * Jobs are ephemeral — upgrading from v1 (no jobs table) is a clean create.
 */
import type Database from 'better-sqlite3';

/** Version number recorded in `PRAGMA user_version` after this migration runs. */
export const VERSION = 2;

/** Human-readable description surfaced in logs. */
export const DESCRIPTION = 'jobs table (ADR 0004)';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE jobs (
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
    CREATE INDEX idx_jobs_status_updated_at ON jobs (status, updated_at);
  `);
}
