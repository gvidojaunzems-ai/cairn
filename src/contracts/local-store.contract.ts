/**
 * LocalStore contract.
 *
 * DO NOT MODIFY EXPORTS WITHOUT A VERSIONING ADR.
 *
 * Business rules:
 *   - `LocalStoreSchema.version` is the migration key. Later tasks that add
 *     tables must bump `version` and register a migration rather than
 *     mutating the existing shape in place.
 *   - The store lives under `resolvePaths().data` — never at a hard-coded
 *     path — so per-OS conventions are honored.
 *   - New descriptor fields (below `version`) are ADDITIVE: existing code
 *     that reads only `version` continues to compile. See ADR 0003 for the
 *     migration-runner contract that these fields describe.
 */

/**
 * Top-level schema descriptor for the on-disk local store (better-sqlite3).
 *
 * The original single-field descriptor is preserved. The new descriptor
 * fields (tables, indexes, virtualTables, migrationsDir, backupsDir) describe
 * the full schema surface for the migration runner and diagnostics without
 * renaming the original `version` field.
 */
export interface LocalStoreSchema {
  /** Schema version for the migration runner. Starts at 1. */
  version: number;
  /**
   * List of entity table names owned by the local store. Populated by the
   * migration runner from `SELECT name FROM sqlite_schema WHERE type='table'`.
   * Optional so existing callers that only need `version` still compile.
   */
  tables?: readonly string[];
  /** List of secondary index names, mirroring `tables`. */
  indexes?: readonly string[];
  /**
   * List of virtual-table names (e.g. sqlite-vec `vec0` vector indexes).
   * Kept separate from `tables` so downstream diagnostics can distinguish
   * plain tables from extension-backed ones.
   */
  virtualTables?: readonly string[];
  /** Directory holding migration files, relative to the source tree. */
  migrationsDir?: string;
  /** Directory where pre-migration DB backups are copied. */
  backupsDir?: string;
}

/**
 * Descriptor for a single migration module discovered by the runner.
 * Additive — not required for the contract test which only pins
 * `LocalStoreSchema`.
 */
export interface MigrationDescriptor {
  /** Sequential integer version, e.g. 1 for `0001-init.ts`. */
  version: number;
  /** Human-readable name (kebab-case, no extension). */
  name: string;
}

/**
 * Canonical list of entity-table names introduced in migration
 * `0001-init.ts`. Kept in the contract so consumers can iterate without
 * importing anything from `src/main/db/**`.
 */
export const KNOWN_ENTITY_TABLES = [
  'knowledge_items',
  'people',
  'projects',
  'charters',
  'news_items',
  'docs',
  'tickets',
  'wip_signals',
  'vectors',
  'vector_metadata',
  'team_repos',
  'ai_tasks',
  'settings',
  'audit_log',
  'sessions',
  'embeddings_cache',
  'links',
  'tags',
  'attachments',
  'events',
  'schema_version',
] as const;

/**
 * Union of the well-known entity-table names. Callers may still supply an
 * arbitrary string (via `tables?: readonly string[]`) — this union exists
 * so autocomplete and exhaustive switches over known entities work.
 */
export type KnownEntityTable = (typeof KNOWN_ENTITY_TABLES)[number];
