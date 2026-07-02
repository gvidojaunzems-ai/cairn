/**
 * DAO for the `updates` table (daily standup markers).
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface Update extends RowMeta {
  projectId: string;
  authorId?: string | null;
  content: string;
}

interface UpdateRow {
  id: string;
  project_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

function rowToUpdate(row: UpdateRow): Update {
  return {
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface UpdatesDao {
  upsert(update: Update): Update;
  get(id: string): Update | undefined;
  list(projectId?: string): Update[];
  delete(id: string): boolean;
}

export function createUpdatesDao(db: Database.Database): UpdatesDao {
  const upsertStmt = db.prepare(
    `INSERT INTO updates (id, project_id, author_id, content, created_at, updated_at)
     VALUES (@id, @projectId, @authorId, @content, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       author_id = excluded.author_id,
       content = excluded.content,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM updates WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM updates ORDER BY created_at DESC');
  const listByProjectStmt = db.prepare<[string]>(
    'SELECT * FROM updates WHERE project_id = ? ORDER BY created_at DESC',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM updates WHERE id = ?');

  return {
    upsert(update: Update): Update {
      const now = nowIso();
      const createdAt = update.createdAt.length > 0 ? update.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: update.id,
        projectId: update.projectId,
        authorId: update.authorId ?? null,
        content: update.content,
        createdAt,
        updatedAt,
      });
      return { ...update, createdAt, updatedAt };
    },
    get(id: string): Update | undefined {
      const row = getStmt.get(id) as UpdateRow | undefined;
      return row === undefined ? undefined : rowToUpdate(row);
    },
    list(projectId?: string): Update[] {
      const rows =
        projectId === undefined
          ? (listAllStmt.all() as UpdateRow[])
          : (listByProjectStmt.all(projectId) as UpdateRow[]);
      return rows.map(rowToUpdate);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
