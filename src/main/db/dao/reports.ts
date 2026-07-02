/**
 * DAO for the `reports` table.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface Report extends RowMeta {
  projectId?: string | null;
  title: string;
  content: string;
}

interface ReportRow {
  id: string;
  project_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface ReportsDao {
  upsert(report: Report): Report;
  get(id: string): Report | undefined;
  list(projectId?: string): Report[];
  delete(id: string): boolean;
}

export function createReportsDao(db: Database.Database): ReportsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO reports (id, project_id, title, content, created_at, updated_at)
     VALUES (@id, @projectId, @title, @content, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       title = excluded.title,
       content = excluded.content,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM reports WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM reports ORDER BY created_at DESC');
  const listByProjectStmt = db.prepare<[string]>(
    'SELECT * FROM reports WHERE project_id = ? ORDER BY created_at DESC',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM reports WHERE id = ?');

  return {
    upsert(report: Report): Report {
      const now = nowIso();
      const createdAt = report.createdAt.length > 0 ? report.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: report.id,
        projectId: report.projectId ?? null,
        title: report.title,
        content: report.content,
        createdAt,
        updatedAt,
      });
      return { ...report, createdAt, updatedAt };
    },
    get(id: string): Report | undefined {
      const row = getStmt.get(id) as ReportRow | undefined;
      return row === undefined ? undefined : rowToReport(row);
    },
    list(projectId?: string): Report[] {
      const rows =
        projectId === undefined
          ? (listAllStmt.all() as ReportRow[])
          : (listByProjectStmt.all(projectId) as ReportRow[]);
      return rows.map(rowToReport);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
