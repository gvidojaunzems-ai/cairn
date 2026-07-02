/**
 * DAO for the `knowledge_items` table.
 *
 * Business rules:
 *   - `KnowledgeItem` mirrors the shape declared by
 *     `src/contracts/domain-model.contract.ts` — the DAO returns rows that
 *     are directly assignable to the contract type so callers never see
 *     raw SQLite row shape.
 *   - `upsert` is idempotent by `id` and updates `updated_at` on every
 *     write. `bulkUpsert` runs inside a single transaction so a partial
 *     batch cannot leave the DB in a mixed state.
 *   - Every parameterised statement uses `?` placeholders — never string
 *     interpolation of caller-provided values.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface KnowledgeItem extends RowMeta {
  /** Item kind — free-form, defined by producers (e.g. 'article', 'note'). */
  type: string;
  /** Textual content. Binary payloads must be referenced, not embedded. */
  content: string;
  /** Optional provenance label (e.g. 'github', 'user-import'). */
  source?: string | null;
}

interface KnowledgeItemRow {
  id: string;
  type: string;
  content: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: KnowledgeItemRow): KnowledgeItem {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface KnowledgeItemsDao {
  upsert(item: KnowledgeItem): KnowledgeItem;
  get(id: string): KnowledgeItem | undefined;
  list(limit?: number, offset?: number): KnowledgeItem[];
  delete(id: string): boolean;
  bulkUpsert(items: readonly KnowledgeItem[], signal?: AbortSignal): number;
}

/**
 * Construct a DAO bound to `db`. Prepared statements are cached on the DAO
 * instance so callers can reuse the same handle across requests without
 * re-parsing SQL.
 */
export function createKnowledgeItemsDao(db: Database.Database): KnowledgeItemsDao {
  const upsertStmt = db.prepare<[string, string, string, string | null, string, string]>(
    `INSERT INTO knowledge_items (id, type, content, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       content = excluded.content,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM knowledge_items WHERE id = ?');
  const listStmt = db.prepare<[number, number]>(
    'SELECT * FROM knowledge_items ORDER BY created_at DESC LIMIT ? OFFSET ?',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM knowledge_items WHERE id = ?');

  function upsert(item: KnowledgeItem): KnowledgeItem {
    const now = nowIso();
    const createdAt = item.createdAt.length > 0 ? item.createdAt : now;
    const updatedAt = now;
    upsertStmt.run(item.id, item.type, item.content, item.source ?? null, createdAt, updatedAt);
    return { ...item, createdAt, updatedAt };
  }

  function bulkUpsert(items: readonly KnowledgeItem[], signal?: AbortSignal): number {
    let count = 0;
    const apply = db.transaction((batch: readonly KnowledgeItem[]) => {
      for (const item of batch) {
        if (signal?.aborted === true) {
          throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
        }
        upsert(item);
        count += 1;
      }
    });
    apply(items);
    return count;
  }

  return {
    upsert,
    get(id: string): KnowledgeItem | undefined {
      const row = getStmt.get(id) as KnowledgeItemRow | undefined;
      return row === undefined ? undefined : rowToItem(row);
    },
    list(limit = 100, offset = 0): KnowledgeItem[] {
      const rows = listStmt.all(limit, offset) as KnowledgeItemRow[];
      return rows.map(rowToItem);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
    bulkUpsert,
  };
}
