/**
 * DAO for the `apps` table.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface App extends RowMeta {
  name: string;
  url?: string | null;
  category?: string | null;
  description?: string | null;
}

interface AppRow {
  id: string;
  name: string;
  url: string | null;
  category: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function rowToApp(row: AppRow): App {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    category: row.category,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface AppsDao {
  upsert(app: App): App;
  get(id: string): App | undefined;
  list(): App[];
  delete(id: string): boolean;
}

export function createAppsDao(db: Database.Database): AppsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO apps (id, name, url, category, description, created_at, updated_at)
     VALUES (@id, @name, @url, @category, @description, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       url = excluded.url,
       category = excluded.category,
       description = excluded.description,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM apps WHERE id = ?');
  const listStmt = db.prepare('SELECT * FROM apps ORDER BY name ASC');
  const deleteStmt = db.prepare<[string]>('DELETE FROM apps WHERE id = ?');

  return {
    upsert(app: App): App {
      const now = nowIso();
      const createdAt = app.createdAt.length > 0 ? app.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: app.id,
        name: app.name,
        url: app.url ?? null,
        category: app.category ?? null,
        description: app.description ?? null,
        createdAt,
        updatedAt,
      });
      return { ...app, createdAt, updatedAt };
    },
    get(id: string): App | undefined {
      const row = getStmt.get(id) as AppRow | undefined;
      return row === undefined ? undefined : rowToApp(row);
    },
    list(): App[] {
      return (listStmt.all() as AppRow[]).map(rowToApp);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
