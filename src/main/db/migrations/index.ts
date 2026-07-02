/**
 * Migration registry.
 *
 * Business rules:
 *   - Migrations are forward-only. There is no `down()` — the migration
 *     runner backs up cairn.db before applying so recovery is by restore,
 *     not rollback.
 *   - `MIGRATIONS` MUST be a sequential, gap-free list starting at 1. The
 *     migration runner validates this at construction time; a gap would let
 *     a partially-applied migration silently skip.
 *   - Every registered module must export `VERSION`, `DESCRIPTION`, and
 *     `up(db)`. Add new migrations to the end of the list, never in the
 *     middle.
 */
import type Database from 'better-sqlite3';

import * as initial from './0001-init.js';

export interface Migration {
  /** Sequential integer version, matches `PRAGMA user_version` after apply. */
  version: number;
  /** Short human-readable label used in log lines. */
  description: string;
  /** Apply the migration. Called inside the runner's BEGIN…COMMIT block. */
  up(db: Database.Database): void;
}

/**
 * Ordered list of every migration this build knows about. Sequential,
 * gap-free, forward-only. Add new migrations by appending to this array.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: initial.VERSION, description: initial.DESCRIPTION, up: initial.up },
];
