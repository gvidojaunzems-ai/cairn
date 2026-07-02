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
 *   - v2 bump: adds the `jobs` table row shape (`JobsTableRow`) and the
 *     `JobStatus` union so the background-worker job manager can persist
 *     lifecycle state across process restarts. See ADR 0004 for the
 *     versioning rationale — the change is additive (jobs table did not
 *     previously exist) but bumps `version` to `2` so the migration runner
 *     can differentiate first-boot vs upgrade paths.
 */

/**
 * Top-level schema descriptor for the on-disk local store (better-sqlite3).
 *
 * `version` is typed as the literal `2` so a type-level check
 * (`LocalStoreSchema['version']` extends `2`) fails the compile the moment
 * the on-disk schema is bumped without updating this contract.
 *
 * The descriptor fields (tables, indexes, virtualTables, migrationsDir,
 * backupsDir) describe the full schema surface for the migration runner
 * and diagnostics without renaming the original `version` field.
 */
export interface LocalStoreSchema {
  /** Schema version for the migration runner. Currently `2`. */
  version: 2;
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
 * Current on-disk schema version. The migration runner uses this as the
 * target when it decides whether to apply pending migrations.
 *
 * Kept as a runtime constant (in addition to the literal type on
 * `LocalStoreSchema.version`) so consumers that need a value — like the
 * migration runner — do not have to duplicate the literal.
 */
export const CURRENT_LOCAL_STORE_SCHEMA_VERSION = 2 as const;

/**
 * Discriminated status union for rows in the `jobs` table.
 *
 * Lifecycle:
 *   - `pending`   : job has been enqueued but the worker has not started it.
 *   - `running`   : the worker is actively executing the job.
 *   - `succeeded` : terminal — job finished and produced a `result`.
 *   - `failed`    : terminal — job crashed or errored and populated `error`.
 *   - `cancelled` : terminal — a cancel request was honored mid-flight.
 */
export type JobStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/**
 * Row shape for the `jobs` table (schema v2).
 *
 * Times are stored as UNIX epoch milliseconds (`number`) rather than ISO
 * strings so ordering and delta arithmetic stay index-friendly at the SQL
 * layer. `progressPct` is optional: not every job emits progress.
 */
export interface JobsTableRow {
  /** Stable identifier assigned by the job manager (opaque to consumers). */
  id: string;
  /** Kind tag used to route the job to a registered runner. */
  kind: string;
  /** Current lifecycle status; see `JobStatus`. */
  status: JobStatus;
  /** Milliseconds since epoch when the row was inserted. */
  createdAt: number;
  /** Milliseconds since epoch of the most-recent status/progress update. */
  updatedAt: number;
  /** Optional 0..100 progress hint; absent for jobs that don't report progress. */
  progressPct?: number;
  /** Optional user-safe label displayed alongside progress. */
  label?: string;
  /** JSON-serialised result payload for terminal `succeeded` rows. */
  result?: string;
  /** User-safe error message for terminal `failed` / `cancelled` rows. */
  error?: string;
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

/**
 * Canonical table manifest introduced in migration `0001-init.ts`.
 * Consumers iterate this list without importing from `src/main/db/**`.
 */
export const TABLE_MANIFEST = [
  'people',
  'projects',
  'charters',
  'knowledge_items',
  'news_topics',
  'news_items',
  'docs',
  'tickets',
  'wip_signals',
  'updates',
  'decisions',
  'apps',
  'meetings',
  'action_items',
  'reports',
  'feeds',
  'budget_ledger',
  'jobs',
  'sync_state',
  'settings_kv',
  'vector_metadata',
  'vec_items',
] as const;

/** Highest schema version this contract describes. */
export const CURRENT_SCHEMA_VERSION = 2;

/** Default vec0 embedding dimension (OpenAI ada-002 / text-embedding-3-small). */
export const VECTOR_DIMENSION = 1536;
