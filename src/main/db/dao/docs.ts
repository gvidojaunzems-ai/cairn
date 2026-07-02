/**
 * DAO for the `docs` table.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface Doc extends RowMeta {
  projectId?: string | null;
  title: string;
  url?: string | null;
  contentHash?: string | null;
}

interface DocRow {
  id: string;
  project_id: string | null;
  title: string;
  url: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDoc(row: DocRow): Doc {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    url: row.url,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface DocsDao {
  upsert(doc: Doc): Doc;
  get(id: string): Doc | undefined;
  list(projectId?: string): Doc[];
  delete(id: string): boolean;
}

export function createDocsDao(db: Database.Database): DocsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO docs (id, project_id, title, url, content_hash, created_at, updated_at)
     VALUES (@id, @projectId, @title, @url, @contentHash, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       title = excluded.title,
       url = excluded.url,
       content_hash = excluded.content_hash,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM docs WHERE id = ?');
  const listByProjectStmt = db.prepare<[string]>(
    'SELECT * FROM docs WHERE project_id = ? ORDER BY updated_at DESC',
  );
  const listAllStmt = db.prepare('SELECT * FROM docs ORDER BY updated_at DESC');
  const deleteStmt = db.prepare<[string]>('DELETE FROM docs WHERE id = ?');

  return {
    upsert(doc: Doc): Doc {
      const now = nowIso();
      const createdAt = doc.createdAt.length > 0 ? doc.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: doc.id,
        projectId: doc.projectId ?? null,
        title: doc.title,
        url: doc.url ?? null,
        contentHash: doc.contentHash ?? null,
        createdAt,
        updatedAt,
      });
      return { ...doc, createdAt, updatedAt };
    },
    get(id: string): Doc | undefined {
      const row = getStmt.get(id) as DocRow | undefined;
      return row === undefined ? undefined : rowToDoc(row);
    },
    list(projectId?: string): Doc[] {
      const rows =
        projectId === undefined
          ? (listAllStmt.all() as DocRow[])
          : (listByProjectStmt.all(projectId) as DocRow[]);
      return rows.map(rowToDoc);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
