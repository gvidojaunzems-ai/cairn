/**
 * In-memory FixtureDao used by the seed runner and contract tests.
 *
 * Maps contract-shaped fixture rows onto the migration 0001 schema so
 * `pnpm seed` and S7 assertions can run without a persisted cairn.db.
 */
import Database from 'better-sqlite3';

import type { Charter } from '../../../contracts/domain-model.contract.js';
import type { Doc } from '../../../contracts/domain-model.contract.js';
import type { NewsItem } from '../../../contracts/domain-model.contract.js';
import type { Person } from '../../../contracts/domain-model.contract.js';
import type { Project } from '../../../contracts/domain-model.contract.js';
import type { Ticket } from '../../../contracts/domain-model.contract.js';
import type { Vector } from '../../../contracts/domain-model.contract.js';
import type { WipSignal } from '../../../contracts/domain-model.contract.js';
import { loadSqliteVec } from '../connection.js';
import { createVectorsDao } from '../dao/vectors.js';
import { runMigrations } from '../migrations/runner.js';
import { VECTOR_DIMENSION } from '../schema.js';

import type { FixtureDao } from './fixture-runner.js';

type DbProjectStatus = 'active' | 'paused' | 'completed' | 'archived';
type DbTicketStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'closed';
type DbWipStatus = 'active' | 'resolved' | 'muted';

function mapProjectStatus(status: string): DbProjectStatus {
  switch (status) {
    case 'paused':
      return 'paused';
    case 'shipped':
    case 'completed':
    case 'archived':
      return status === 'archived' ? 'archived' : 'completed';
    case 'blocked':
      return 'paused';
  }
  return 'active';
}

function mapTicketStatus(status: string): DbTicketStatus {
  switch (status) {
    case 'in_progress':
      return 'in_progress';
    case 'blocked':
      return 'blocked';
    case 'done':
      return 'done';
    case 'wont_do':
    case 'closed':
      return 'closed';
    case 'in_review':
      return 'in_progress';
  }
  return 'open';
}

function mapWipStatus(status: string): DbWipStatus {
  switch (status) {
    case 'resolved':
      return 'resolved';
    case 'stale':
    case 'muted':
      return 'muted';
  }
  return 'active';
}

function padEmbedding(values: readonly number[]): Float32Array {
  const out = new Float32Array(VECTOR_DIMENSION);
  for (let index = 0; index < VECTOR_DIMENSION; index += 1) {
    out[index] = values[index % values.length] ?? 0;
  }
  return out;
}

function insertPeople(db: Database.Database, rows: readonly unknown[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO people (id, name, role, email, avatar_url, status, created_at, updated_at)
     VALUES (@id, @name, @role, @email, NULL, 'active', @createdAt, @updatedAt)`,
  );
  let inserted = 0;
  for (const row of rows as readonly Person[]) {
    const ts = row.createdAt;
    const result = stmt.run({
      id: row.id,
      name: row.name,
      role: row.handle ?? null,
      email: row.email ?? null,
      createdAt: ts,
      updatedAt: ts,
    });
    inserted += result.changes;
  }
  return inserted;
}

function insertProjects(db: Database.Database, rows: readonly unknown[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (@id, @name, @description, @status, @createdAt, @updatedAt)`,
  );
  let inserted = 0;
  for (const row of rows as readonly Project[]) {
    const result = stmt.run({
      id: row.id,
      name: row.name,
      description: row.summary ?? null,
      status: mapProjectStatus(row.status),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    inserted += result.changes;
  }
  return inserted;
}

function insertCharters(db: Database.Database, rows: readonly unknown[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO charters (id, project_id, title, body, created_at, updated_at)
     VALUES (@id, @projectId, @title, @body, @createdAt, @updatedAt)`,
  );
  let inserted = 0;
  for (const row of rows as readonly Charter[]) {
    const result = stmt.run(row);
    inserted += result.changes;
  }
  return inserted;
}

function insertDocs(db: Database.Database, rows: readonly unknown[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO docs (id, project_id, title, url, content_hash, created_at, updated_at)
     VALUES (@id, @projectId, @title, NULL, NULL, @createdAt, @updatedAt)`,
  );
  let inserted = 0;
  for (const row of rows as readonly Doc[]) {
    const result = stmt.run({
      id: row.id,
      projectId: row.projectId ?? null,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    inserted += result.changes;
  }
  return inserted;
}

function insertTickets(db: Database.Database, rows: readonly unknown[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO tickets
       (id, project_id, external_id, title, status, assignee_id, url, created_at, updated_at)
     VALUES (@id, @projectId, NULL, @title, @status, @assigneeId, NULL, @createdAt, @updatedAt)`,
  );
  let inserted = 0;
  for (const row of rows as readonly Ticket[]) {
    const result = stmt.run({
      id: row.id,
      projectId: row.projectId ?? null,
      title: row.title,
      status: mapTicketStatus(row.status),
      assigneeId: row.assigneeId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    inserted += result.changes;
  }
  return inserted;
}

function insertWipSignals(db: Database.Database, rows: readonly unknown[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO wip_signals
       (id, entity_id, entity_type, summary, status, source, created_at, updated_at)
     VALUES (@id, @entityId, @entityType, @summary, @status, @source, @createdAt, @updatedAt)`,
  );
  let inserted = 0;
  for (const row of rows as readonly WipSignal[]) {
    const entityId = row.projectId ?? row.personId ?? row.id;
    const entityType = row.projectId !== undefined ? 'project' : 'person';
    const ts = row.detectedAt;
    const result = stmt.run({
      id: row.id,
      entityId,
      entityType,
      summary: row.title,
      status: mapWipStatus(row.status),
      source: row.detail ?? null,
      createdAt: ts,
      updatedAt: ts,
    });
    inserted += result.changes;
  }
  return inserted;
}

function insertNewsItems(db: Database.Database, rows: readonly unknown[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO news_items
       (id, topic_id, title, summary, url, source, published_at, created_at, updated_at)
     VALUES (@id, NULL, @title, @summary, @url, @source, @publishedAt, @createdAt, @updatedAt)`,
  );
  let inserted = 0;
  for (const row of rows as readonly NewsItem[]) {
    const ts = row.ingestedAt;
    const result = stmt.run({
      id: row.id,
      title: row.title,
      summary: row.body ?? null,
      url: row.url ?? null,
      source: row.source,
      publishedAt: row.publishedAt ?? null,
      createdAt: ts,
      updatedAt: ts,
    });
    inserted += result.changes;
  }
  return inserted;
}

function insertVectors(db: Database.Database, rows: readonly unknown[]): number {
  const dao = createVectorsDao(db);
  const records = (rows as readonly Vector[]).map((row) => ({
    entityId: row.entityId,
    entityType: row.entityType,
    embedding: padEmbedding(row.embedding),
  }));
  return dao.bulkUpsert(records);
}

const INSERT_HANDLERS: Record<string, (db: Database.Database, rows: readonly unknown[]) => number> = {
  people: insertPeople,
  projects: insertProjects,
  charters: insertCharters,
  docs: insertDocs,
  tickets: insertTickets,
  wip_signals: insertWipSignals,
  news_items: insertNewsItems,
  vectors: insertVectors,
};

/**
 * Open an in-memory cairn.db, apply migrations, and return a FixtureDao.
 */
export function createFixtureDao(): FixtureDao {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  loadSqliteVec(db);
  runMigrations(db, {});

  return {
    insertBulk<T>(table: string, rows: readonly T[]): { inserted: number; skipped: number } {
      const handler = INSERT_HANDLERS[table];
      if (handler === undefined) {
        throw new Error(`No fixture insert handler for table '${table}'`);
      }
      const inserted = handler(db, rows);
      return { inserted, skipped: rows.length - inserted };
    },
  };
}
