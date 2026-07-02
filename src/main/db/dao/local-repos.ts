/**
 * DAO for the `local_repos` table (migration 0003).
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface LocalRepo extends RowMeta {
  name: string;
  path: string;
  branch?: string | null;
  ahead: number;
  dirty: boolean;
  lastScannedAt?: string | null;
}

interface LocalRepoRow {
  id: string;
  name: string;
  path: string;
  branch: string | null;
  ahead: number;
  dirty: number;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToLocalRepo(row: LocalRepoRow): LocalRepo {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    branch: row.branch,
    ahead: row.ahead,
    dirty: row.dirty === 1,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface LocalReposDao {
  upsert(repo: LocalRepo): LocalRepo;
  get(id: string): LocalRepo | undefined;
  getByPath(path: string): LocalRepo | undefined;
  list(): LocalRepo[];
  delete(id: string): boolean;
}

export function createLocalReposDao(db: Database.Database): LocalReposDao {
  const upsertStmt = db.prepare(
    `INSERT INTO local_repos (id, name, path, branch, ahead, dirty, last_scanned_at, created_at, updated_at)
     VALUES (@id, @name, @path, @branch, @ahead, @dirty, @lastScannedAt, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       path = excluded.path,
       branch = excluded.branch,
       ahead = excluded.ahead,
       dirty = excluded.dirty,
       last_scanned_at = excluded.last_scanned_at,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM local_repos WHERE id = ?');
  const getByPathStmt = db.prepare<[string]>('SELECT * FROM local_repos WHERE path = ?');
  const listStmt = db.prepare('SELECT * FROM local_repos ORDER BY name ASC');
  const deleteStmt = db.prepare<[string]>('DELETE FROM local_repos WHERE id = ?');

  return {
    upsert(repo: LocalRepo): LocalRepo {
      const now = nowIso();
      const createdAt = repo.createdAt.length > 0 ? repo.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: repo.id,
        name: repo.name,
        path: repo.path,
        branch: repo.branch ?? null,
        ahead: repo.ahead,
        dirty: repo.dirty ? 1 : 0,
        lastScannedAt: repo.lastScannedAt ?? null,
        createdAt,
        updatedAt,
      });
      return { ...repo, createdAt, updatedAt };
    },
    get(id: string): LocalRepo | undefined {
      const row = getStmt.get(id) as LocalRepoRow | undefined;
      return row === undefined ? undefined : rowToLocalRepo(row);
    },
    getByPath(path: string): LocalRepo | undefined {
      const row = getByPathStmt.get(path) as LocalRepoRow | undefined;
      return row === undefined ? undefined : rowToLocalRepo(row);
    },
    list(): LocalRepo[] {
      return (listStmt.all() as LocalRepoRow[]).map(rowToLocalRepo);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
