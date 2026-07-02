/**
 * DAO for the `projects` table.
 *
 * Business rules:
 *   - `status` is constrained by CHECK at the DB layer to
 *     'active' | 'paused' | 'completed' | 'archived'. Keep the TS union in
 *     sync so callers see compile-time enforcement.
 *   - `bulkUpsert` runs inside a single transaction and honours an
 *     AbortSignal so large imports stay cancellable.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface Project extends RowMeta {
  name: string;
  description?: string | null;
  status: ProjectStatus;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface ProjectsDao {
  upsert(project: Project): Project;
  get(id: string): Project | undefined;
  list(status?: ProjectStatus): Project[];
  delete(id: string): boolean;
  bulkUpsert(projects: readonly Project[], signal?: AbortSignal): number;
}

export function createProjectsDao(db: Database.Database): ProjectsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (@id, @name, @description, @status, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM projects WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM projects ORDER BY name ASC');
  const listByStatusStmt = db.prepare<[ProjectStatus]>(
    'SELECT * FROM projects WHERE status = ? ORDER BY name ASC',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM projects WHERE id = ?');

  function upsert(project: Project): Project {
    const now = nowIso();
    const createdAt = project.createdAt.length > 0 ? project.createdAt : now;
    const updatedAt = now;
    upsertStmt.run({
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      status: project.status,
      createdAt,
      updatedAt,
    });
    return { ...project, createdAt, updatedAt };
  }

  function bulkUpsert(projects: readonly Project[], signal?: AbortSignal): number {
    let count = 0;
    const apply = db.transaction((batch: readonly Project[]) => {
      for (const project of batch) {
        if (signal?.aborted === true) {
          throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
        }
        upsert(project);
        count += 1;
      }
    });
    apply(projects);
    return count;
  }

  return {
    upsert,
    get(id: string): Project | undefined {
      const row = getStmt.get(id) as ProjectRow | undefined;
      return row === undefined ? undefined : rowToProject(row);
    },
    list(status?: ProjectStatus): Project[] {
      const rows =
        status === undefined
          ? (listAllStmt.all() as ProjectRow[])
          : (listByStatusStmt.all(status) as ProjectRow[]);
      return rows.map(rowToProject);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
    bulkUpsert,
  };
}
