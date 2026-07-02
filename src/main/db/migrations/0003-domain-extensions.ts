/**
 * Migration 0003 — domain extensions and local-repo tracking.
 *
 * Core entity tables (updates, decisions, apps, meetings, action_items,
 * reports, feeds) were created in 0001. This migration adds supporting
 * structures engines rely on: local repo registry, doc body storage for
 * search/RAG, and performance indexes.
 */
import type Database from 'better-sqlite3';

export const VERSION = 3;

export const DESCRIPTION = 'domain extensions — local_repos, doc content, indexes';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_repos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      branch TEXT,
      ahead INTEGER NOT NULL DEFAULT 0,
      dirty INTEGER NOT NULL DEFAULT 0 CHECK (dirty IN (0, 1)),
      last_scanned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_local_repos_path ON local_repos(path);

    ALTER TABLE docs ADD COLUMN content TEXT;
    ALTER TABLE docs ADD COLUMN group_name TEXT;
    ALTER TABLE docs ADD COLUMN status TEXT DEFAULT 'ok'
      CHECK (status IN ('ok', 'stale', 'draft'));

    CREATE INDEX IF NOT EXISTS ix_updates_created ON updates(created_at DESC);
    CREATE INDEX IF NOT EXISTS ix_decisions_status ON decisions(status);
    CREATE INDEX IF NOT EXISTS ix_meetings_started ON meetings(started_at DESC);
    CREATE INDEX IF NOT EXISTS ix_action_items_status ON action_items(status);
    CREATE INDEX IF NOT EXISTS ix_reports_created ON reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS ix_feeds_enabled ON feeds(enabled);
    CREATE INDEX IF NOT EXISTS ix_budget_ledger_date ON budget_ledger(ledger_date DESC);
  `);
}
