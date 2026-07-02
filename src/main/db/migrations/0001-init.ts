/**
 * Migration 0001 — initial schema.
 *
 * Creates every entity table for Cairn v1. All migrations are forward-only
 * and applied inside a single BEGIN…COMMIT by the runner; this file just
 * emits the DDL.
 *
 * Business rules:
 *   - Every row carries `id TEXT PRIMARY KEY`, `created_at TEXT NOT NULL`,
 *     `updated_at TEXT NOT NULL` (UTC ISO-8601 strings) so the DAO layer can
 *     share a common upsert shape.
 *   - Vector storage uses the sqlite-vec `vec0` virtual table joined to a
 *     regular `vector_metadata` table on rowid — sqlite-vec 0.1.6 does not
 *     expose stable auxiliary/partition column semantics, so metadata
 *     filtering is done at the DAO layer via a rowid join.
 *   - Status enums are enforced by CHECK constraints so the DB rejects
 *     out-of-band values even when the caller bypasses the TypeScript layer.
 */
import type Database from 'better-sqlite3';

import { VEC_ITEMS_TABLE, VECTOR_DIMENSION, VECTOR_METADATA_TABLE } from '../schema.js';

/** Version number recorded in `PRAGMA user_version` after this migration runs. */
export const VERSION = 1;

/** Human-readable description surfaced in logs. */
export const DESCRIPTION = 'initial schema';

const CORE_TABLES_SQL = `
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_people_status ON people(status);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_projects_status ON projects(status);

CREATE TABLE charters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_charters_project ON charters(project_id);

CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_knowledge_items_type ON knowledge_items(type);

CREATE TABLE news_topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE news_items (
  id TEXT PRIMARY KEY,
  topic_id TEXT REFERENCES news_topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  source TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_news_items_topic ON news_items(topic_id);
CREATE INDEX ix_news_items_published ON news_items(published_at);

CREATE TABLE docs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_docs_project ON docs(project_id);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'closed')),
  assignee_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_tickets_project ON tickets(project_id);
CREATE INDEX ix_tickets_status ON tickets(status);
CREATE INDEX ix_tickets_assignee ON tickets(assignee_id);

CREATE TABLE wip_signals (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'muted')),
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_wip_signals_entity ON wip_signals(entity_type, entity_id);
CREATE INDEX ix_wip_signals_status ON wip_signals(status);

CREATE TABLE updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_updates_project ON updates(project_id);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'rejected', 'superseded')),
  decided_by TEXT REFERENCES people(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_decisions_project ON decisions(project_id);

CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  category TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  attendee_ids TEXT NOT NULL DEFAULT '[]',
  agenda TEXT,
  outcome TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_meetings_project ON meetings(project_id);

CREATE TABLE action_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_action_items_meeting ON action_items(meeting_id);
CREATE INDEX ix_action_items_owner ON action_items(owner_id);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_reports_project ON reports(project_id);

CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  feed_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_fetched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE budget_ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  ledger_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_budget_ledger_project ON budget_ledger(project_id);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  payload TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_jobs_status ON jobs(status);

CREATE TABLE sync_state (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  last_synced_at TEXT,
  cursor TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ix_sync_state_entity ON sync_state(entity_type);

CREATE TABLE settings_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Build the `vec_items` virtual-table DDL. Interpolating `VECTOR_DIMENSION`
 * is safe here because it is a compile-time constant — never user input.
 */
function vectorDdl(): string {
  return `
CREATE TABLE ${VECTOR_METADATA_TABLE} (
  rowid INTEGER PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ix_${VECTOR_METADATA_TABLE}_entity
  ON ${VECTOR_METADATA_TABLE}(entity_type, entity_id);
CREATE INDEX ix_${VECTOR_METADATA_TABLE}_type
  ON ${VECTOR_METADATA_TABLE}(entity_type);

CREATE VIRTUAL TABLE ${VEC_ITEMS_TABLE}
  USING vec0(embedding float[${VECTOR_DIMENSION}]);
`;
}

/**
 * Apply the migration against a live better-sqlite3 handle. The runner has
 * already opened a transaction — callers of `up` must not BEGIN their own.
 */
export function up(db: Database.Database): void {
  db.exec(CORE_TABLES_SQL);
  db.exec(vectorDdl());
}
