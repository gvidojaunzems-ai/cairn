/**
 * Vector DAO — sqlite-vec `vec0` virtual table + companion metadata table.
 *
 * Business rules:
 *   - sqlite-vec 0.1.6 does not expose stable auxiliary/partition column
 *     semantics for metadata filtering — we keep entity_id / entity_type in
 *     a regular `vector_metadata` table joined to `vec_items` on rowid.
 *     Filtering runs at the DAO layer via that join.
 *   - Embeddings are stored as packed float32 `Buffer`s per sqlite-vec's
 *     wire format. `Float32Array#buffer` is the direct source.
 *   - `bulkUpsert` chunks writes into `VECTOR_BULK_UPSERT_CHUNK_SIZE` per
 *     transaction so a very large batch does not exceed the 400 MB RAM
 *     budget or block the write lock for too long. Every chunk boundary is
 *     an `AbortSignal` check-point.
 *   - `topK` accepts a `k` and an optional `entityType` metadata filter.
 *     When the filter is present the DAO fetches `k * candidateMultiplier`
 *     candidates from vec0 then joins/filters/re-ranks — the "hybrid" path
 *     from the dependency-decisions doc.
 */
import type Database from 'better-sqlite3';

import {
  VECTOR_BULK_UPSERT_CHUNK_SIZE,
  VECTOR_DIMENSION,
  VECTOR_METADATA_TABLE,
  VEC_ITEMS_TABLE,
  type VectorEntityType,
} from '../schema.js';

export interface VectorRecord {
  entityId: string;
  entityType: VectorEntityType | string;
  /** Packed float32 embedding. Must be exactly VECTOR_DIMENSION in length. */
  embedding: Float32Array;
}

export interface TopKResult {
  entityId: string;
  entityType: string;
  distance: number;
}

export interface TopKOptions {
  /** Optional metadata filter — only return vectors of this entity type. */
  entityType?: VectorEntityType | string;
  /**
   * Multiplier applied when a filter is present so the vec0 scan returns
   * enough candidates to satisfy `k` after filtering. Default 10.
   */
  candidateMultiplier?: number;
}

interface MetadataRow {
  rowid: number;
  entity_id: string;
  entity_type: string;
}

interface VecKnnRow {
  rowid: number;
  distance: number;
}

interface ListMetaRow {
  entity_id: string;
  entity_type: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function embeddingToBuffer(embedding: Float32Array): Buffer {
  if (embedding.length !== VECTOR_DIMENSION) {
    throw new Error(
      `Embedding length ${String(embedding.length)} does not match VECTOR_DIMENSION ${String(VECTOR_DIMENSION)}.`,
    );
  }
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

function chunk<T>(records: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < records.length; index += size) {
    chunks.push(records.slice(index, index + size));
  }
  return chunks;
}

export interface VectorsDao {
  upsert(record: VectorRecord): void;
  get(entityType: string, entityId: string): VectorRecord | undefined;
  list(entityType?: string): { entityId: string; entityType: string }[];
  delete(entityType: string, entityId: string): boolean;
  bulkUpsert(records: readonly VectorRecord[], signal?: AbortSignal): number;
  topK(query: Float32Array, k: number, options?: TopKOptions): TopKResult[];
}

/**
 * Construct a vector DAO bound to `db`. Statements are prepared once and
 * reused so callers can call `topK` in a tight loop without reparsing SQL.
 */
export function createVectorsDao(db: Database.Database): VectorsDao {
  const findMetaStmt = db.prepare<[string, string]>(
    `SELECT rowid, entity_id, entity_type FROM ${VECTOR_METADATA_TABLE}
     WHERE entity_type = ? AND entity_id = ?`,
  );
  const insertMetaStmt = db.prepare<[string, string, string, string]>(
    `INSERT INTO ${VECTOR_METADATA_TABLE} (entity_id, entity_type, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
  );
  const touchMetaStmt = db.prepare<[string, number]>(
    `UPDATE ${VECTOR_METADATA_TABLE} SET updated_at = ? WHERE rowid = ?`,
  );
  const deleteMetaStmt = db.prepare<[string, string]>(
    `DELETE FROM ${VECTOR_METADATA_TABLE} WHERE entity_type = ? AND entity_id = ?`,
  );
  const insertVecStmt = db.prepare<[number, Buffer]>(
    `INSERT INTO ${VEC_ITEMS_TABLE} (rowid, embedding) VALUES (?, ?)`,
  );
  const deleteVecStmt = db.prepare<[number]>(
    `DELETE FROM ${VEC_ITEMS_TABLE} WHERE rowid = ?`,
  );
  const getVecStmt = db.prepare<[number]>(
    `SELECT embedding FROM ${VEC_ITEMS_TABLE} WHERE rowid = ?`,
  );
  // sqlite-vec vec0 virtual tables surface `distance` automatically when a
  // MATCH + `k = ?` predicate is used.
  const knnStmt = db.prepare<[Buffer, number]>(
    `SELECT rowid, distance FROM ${VEC_ITEMS_TABLE}
     WHERE embedding MATCH ? AND k = ?
     ORDER BY distance`,
  );
  const listAllMetaStmt = db.prepare(
    `SELECT entity_id, entity_type FROM ${VECTOR_METADATA_TABLE} ORDER BY created_at ASC`,
  );
  const listByTypeMetaStmt = db.prepare<[string]>(
    `SELECT entity_id, entity_type FROM ${VECTOR_METADATA_TABLE}
     WHERE entity_type = ? ORDER BY created_at ASC`,
  );

  function writeVector(rowid: number, embedding: Buffer): void {
    // vec0 rows are keyed by rowid — delete then insert is the documented
    // upsert path for sqlite-vec 0.1.x.
    deleteVecStmt.run(rowid);
    insertVecStmt.run(rowid, embedding);
  }

  function upsert(record: VectorRecord): void {
    const embedding = embeddingToBuffer(record.embedding);
    const now = nowIso();
    const existing = findMetaStmt.get(record.entityType, record.entityId) as
      | MetadataRow
      | undefined;
    let rowid: number;
    if (existing === undefined) {
      const info = insertMetaStmt.run(record.entityId, record.entityType, now, now);
      rowid = Number(info.lastInsertRowid);
    } else {
      rowid = existing.rowid;
      touchMetaStmt.run(now, rowid);
    }
    writeVector(rowid, embedding);
  }

  function bulkUpsert(records: readonly VectorRecord[], signal?: AbortSignal): number {
    let count = 0;
    const applyChunk = db.transaction((batch: readonly VectorRecord[]) => {
      for (const record of batch) {
        upsert(record);
        count += 1;
      }
    });
    for (const batch of chunk(records, VECTOR_BULK_UPSERT_CHUNK_SIZE)) {
      if (signal?.aborted === true) {
        throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
      }
      applyChunk(batch);
    }
    return count;
  }

  function fetchCandidates(query: Buffer, scanLimit: number): VecKnnRow[] {
    return knnStmt.all(query, scanLimit) as VecKnnRow[];
  }

  function loadMetadataFor(rowids: number[], entityType: string | undefined): Map<number, MetadataRow> {
    const map = new Map<number, MetadataRow>();
    if (rowids.length === 0) return map;
    const placeholders = rowids.map(() => '?').join(',');
    const filterClause = entityType === undefined ? '' : ' AND entity_type = ?';
    const params: (number | string)[] = [...rowids];
    if (entityType !== undefined) params.push(entityType);
    const rows = db
      .prepare(
        `SELECT rowid, entity_id, entity_type FROM ${VECTOR_METADATA_TABLE}
         WHERE rowid IN (${placeholders})${filterClause}`,
      )
      .all(...params) as MetadataRow[];
    for (const row of rows) map.set(row.rowid, row);
    return map;
  }

  function topK(query: Float32Array, k: number, options: TopKOptions = {}): TopKResult[] {
    if (k <= 0) return [];
    const queryBuffer = embeddingToBuffer(query);
    const multiplier = options.candidateMultiplier ?? 10;
    const scanLimit =
      options.entityType === undefined ? k : Math.max(k * multiplier, k);
    const candidates = fetchCandidates(queryBuffer, scanLimit);
    if (candidates.length === 0) return [];
    const metaByRow = loadMetadataFor(
      candidates.map((c) => c.rowid),
      options.entityType,
    );
    const result: TopKResult[] = [];
    for (const row of candidates) {
      const meta = metaByRow.get(row.rowid);
      if (meta === undefined) continue;
      result.push({
        entityId: meta.entity_id,
        entityType: meta.entity_type,
        distance: row.distance,
      });
      if (result.length >= k) break;
    }
    return result;
  }

  function get(entityType: string, entityId: string): VectorRecord | undefined {
    const meta = findMetaStmt.get(entityType, entityId) as MetadataRow | undefined;
    if (meta === undefined) return undefined;
    const row = getVecStmt.get(meta.rowid) as { embedding: Buffer } | undefined;
    if (row === undefined) return undefined;
    const view = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
    return {
      entityId: meta.entity_id,
      entityType: meta.entity_type,
      // Copy so callers cannot mutate the underlying Node Buffer.
      embedding: new Float32Array(view),
    };
  }

  function list(entityType?: string): { entityId: string; entityType: string }[] {
    const rows =
      entityType === undefined
        ? (listAllMetaStmt.all() as ListMetaRow[])
        : (listByTypeMetaStmt.all(entityType) as ListMetaRow[]);
    return rows.map((r) => ({ entityId: r.entity_id, entityType: r.entity_type }));
  }

  function del(entityType: string, entityId: string): boolean {
    const meta = findMetaStmt.get(entityType, entityId) as MetadataRow | undefined;
    if (meta === undefined) return false;
    deleteVecStmt.run(meta.rowid);
    const info = deleteMetaStmt.run(entityType, entityId);
    return info.changes > 0;
  }

  return {
    upsert,
    get,
    list,
    delete: del,
    bulkUpsert,
    topK,
  };
}
