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
 */

/**
 * Top-level schema descriptor for the on-disk local store (better-sqlite3).
 */
export interface LocalStoreSchema {
  /** Schema version for the migration runner. Starts at 1. */
  version: number;
}
