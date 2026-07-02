/**
 * DAO for the `wip_signals` table.
 *
 * Privacy invariant:
 *   - WIP signal `summary` values must be natural-language only. This DAO
 *     does not enforce that (naïve regex checks would create false
 *     positives), but the seed/fixture layer validates the invariant and
 *     the schema stores no raw diff/code columns.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export type WipSignalStatus = 'active' | 'resolved' | 'muted';

export interface WipSignal extends RowMeta {
  entityId: string;
  entityType: string;
  summary: string;
  status: WipSignalStatus;
  source?: string | null;
}

interface WipSignalRow {
  id: string;
  entity_id: string;
  entity_type: string;
  summary: string;
  status: WipSignalStatus;
  source: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSignal(row: WipSignalRow): WipSignal {
  return {
    id: row.id,
    entityId: row.entity_id,
    entityType: row.entity_type,
    summary: row.summary,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface WipSignalsDao {
  upsert(signal: WipSignal): WipSignal;
  get(id: string): WipSignal | undefined;
  list(status?: WipSignalStatus): WipSignal[];
  listByEntity(entityType: string, entityId: string): WipSignal[];
  delete(id: string): boolean;
}

export function createWipSignalsDao(db: Database.Database): WipSignalsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO wip_signals (id, entity_id, entity_type, summary, status, source, created_at, updated_at)
     VALUES (@id, @entityId, @entityType, @summary, @status, @source, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       entity_id = excluded.entity_id,
       entity_type = excluded.entity_type,
       summary = excluded.summary,
       status = excluded.status,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM wip_signals WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM wip_signals ORDER BY updated_at DESC');
  const listByStatusStmt = db.prepare<[WipSignalStatus]>(
    'SELECT * FROM wip_signals WHERE status = ? ORDER BY updated_at DESC',
  );
  const listByEntityStmt = db.prepare<[string, string]>(
    'SELECT * FROM wip_signals WHERE entity_type = ? AND entity_id = ? ORDER BY updated_at DESC',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM wip_signals WHERE id = ?');

  return {
    upsert(signal: WipSignal): WipSignal {
      const now = nowIso();
      const createdAt = signal.createdAt.length > 0 ? signal.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: signal.id,
        entityId: signal.entityId,
        entityType: signal.entityType,
        summary: signal.summary,
        status: signal.status,
        source: signal.source ?? null,
        createdAt,
        updatedAt,
      });
      return { ...signal, createdAt, updatedAt };
    },
    get(id: string): WipSignal | undefined {
      const row = getStmt.get(id) as WipSignalRow | undefined;
      return row === undefined ? undefined : rowToSignal(row);
    },
    list(status?: WipSignalStatus): WipSignal[] {
      const rows =
        status === undefined
          ? (listAllStmt.all() as WipSignalRow[])
          : (listByStatusStmt.all(status) as WipSignalRow[]);
      return rows.map(rowToSignal);
    },
    listByEntity(entityType: string, entityId: string): WipSignal[] {
      return (listByEntityStmt.all(entityType, entityId) as WipSignalRow[]).map(rowToSignal);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
