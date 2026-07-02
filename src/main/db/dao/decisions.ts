/**
 * DAO for the `decisions` table.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded';

export interface Decision extends RowMeta {
  projectId?: string | null;
  title: string;
  body: string;
  status: DecisionStatus;
  decidedBy?: string | null;
}

interface DecisionRow {
  id: string;
  project_id: string | null;
  title: string;
  body: string;
  status: DecisionStatus;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    status: row.status,
    decidedBy: row.decided_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface DecisionsDao {
  upsert(decision: Decision): Decision;
  get(id: string): Decision | undefined;
  list(projectId?: string): Decision[];
  delete(id: string): boolean;
}

export function createDecisionsDao(db: Database.Database): DecisionsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO decisions (id, project_id, title, body, status, decided_by, created_at, updated_at)
     VALUES (@id, @projectId, @title, @body, @status, @decidedBy, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       title = excluded.title,
       body = excluded.body,
       status = excluded.status,
       decided_by = excluded.decided_by,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM decisions WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM decisions ORDER BY updated_at DESC');
  const listByProjectStmt = db.prepare<[string]>(
    'SELECT * FROM decisions WHERE project_id = ? ORDER BY updated_at DESC',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM decisions WHERE id = ?');

  return {
    upsert(decision: Decision): Decision {
      const now = nowIso();
      const createdAt = decision.createdAt.length > 0 ? decision.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: decision.id,
        projectId: decision.projectId ?? null,
        title: decision.title,
        body: decision.body,
        status: decision.status,
        decidedBy: decision.decidedBy ?? null,
        createdAt,
        updatedAt,
      });
      return { ...decision, createdAt, updatedAt };
    },
    get(id: string): Decision | undefined {
      const row = getStmt.get(id) as DecisionRow | undefined;
      return row === undefined ? undefined : rowToDecision(row);
    },
    list(projectId?: string): Decision[] {
      const rows =
        projectId === undefined
          ? (listAllStmt.all() as DecisionRow[])
          : (listByProjectStmt.all(projectId) as DecisionRow[]);
      return rows.map(rowToDecision);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
