/**
 * DAO for the `charters` table — a charter is a project's mission statement
 * / scope document. FK to `projects.id` cascades on delete.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface Charter extends RowMeta {
  projectId: string;
  title: string;
  body: string;
}

interface CharterRow {
  id: string;
  project_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function rowToCharter(row: CharterRow): Charter {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface ChartersDao {
  upsert(charter: Charter): Charter;
  get(id: string): Charter | undefined;
  getByProject(projectId: string): Charter[];
  list(): Charter[];
  delete(id: string): boolean;
}

export function createChartersDao(db: Database.Database): ChartersDao {
  const upsertStmt = db.prepare(
    `INSERT INTO charters (id, project_id, title, body, created_at, updated_at)
     VALUES (@id, @projectId, @title, @body, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       title = excluded.title,
       body = excluded.body,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM charters WHERE id = ?');
  const listByProjectStmt = db.prepare<[string]>(
    'SELECT * FROM charters WHERE project_id = ? ORDER BY created_at ASC',
  );
  const listAllStmt = db.prepare('SELECT * FROM charters ORDER BY created_at ASC');
  const deleteStmt = db.prepare<[string]>('DELETE FROM charters WHERE id = ?');

  return {
    upsert(charter: Charter): Charter {
      const now = nowIso();
      const createdAt = charter.createdAt.length > 0 ? charter.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: charter.id,
        projectId: charter.projectId,
        title: charter.title,
        body: charter.body,
        createdAt,
        updatedAt,
      });
      return { ...charter, createdAt, updatedAt };
    },
    get(id: string): Charter | undefined {
      const row = getStmt.get(id) as CharterRow | undefined;
      return row === undefined ? undefined : rowToCharter(row);
    },
    getByProject(projectId: string): Charter[] {
      return (listByProjectStmt.all(projectId) as CharterRow[]).map(rowToCharter);
    },
    list(): Charter[] {
      return (listAllStmt.all() as CharterRow[]).map(rowToCharter);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
