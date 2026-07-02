/**
 * Schema-level constants and shared row shapes for the Cairn local store.
 *
 * Business rules:
 *   - `CODE_SCHEMA_VERSION` is the single source of truth for the schema
 *     version this build knows how to run. The migration runner compares this
 *     value against the DB's `PRAGMA user_version` on every open; a DB with a
 *     higher version is refused to protect against a downgrade corrupting
 *     data written by a newer build.
 *   - `VECTOR_DIMENSION` is baked into the vec0 virtual-table definition and
 *     therefore CANNOT be changed by an ALTER TABLE — bumping it requires a
 *     new migration that drops and recreates `vec_items`.
 *   - Every entity row uses the same primary-key convention (`id TEXT`) and
 *     the same timestamp columns (`created_at`, `updated_at`) so the DAO
 *     layer can share generic upsert helpers.
 */

/**
 * Highest migration version this build knows about. The migration registry
 * (`migrations/index.ts`) must contain a migration with this exact version
 * as its last entry — asserted by the migration runner at construction time.
 */
export const CODE_SCHEMA_VERSION = 3;

/**
 * Default vector dimension for the vec0 virtual table. 1536 matches the
 * OpenAI ada-002 / text-embedding-3-small output size and is a common upper
 * bound for local embedding models — sqlite-vec stores vectors as packed
 * float32, so 1536 dims == 6144 bytes per row (well within budget).
 */
export const VECTOR_DIMENSION = 1536;

/** Name of the vec0 virtual table holding embeddings. */
export const VEC_ITEMS_TABLE = 'vec_items';

/** Companion metadata table joined to `vec_items` on rowid. */
export const VECTOR_METADATA_TABLE = 'vector_metadata';

/** Batch size used by the vector DAO's bulk-upsert method. */
export const VECTOR_BULK_UPSERT_CHUNK_SIZE = 100;

/** File name for cairn.db under `resolvePaths().data`. */
export const DB_FILE_NAME = 'cairn.db';

/** Prefix used when producing pre-migration backup files. */
export const BACKUP_FILE_PREFIX = 'cairn.db.backup';

/** Common fields present on every domain row. */
export interface RowMeta {
  /** Stable identifier assigned at ingest time. */
  id: string;
  /** UTC ISO-8601 creation timestamp. */
  createdAt: string;
  /** UTC ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/** Enumeration of entity types that may own a vector row. */
export type VectorEntityType =
  | 'project'
  | 'person'
  | 'knowledge_item'
  | 'charter'
  | 'news_item'
  | 'doc'
  | 'ticket'
  | 'wip_signal';
