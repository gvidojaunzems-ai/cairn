/**
 * Data access object for the `jobs` table (schema v2).
 *
 * Business rules:
 *   - All writes use prepared statements bound to named parameters — never
 *     concatenate values into SQL strings.
 *   - Every write updates `updated_at` to the current epoch millisecond so
 *     `WHERE status='pending' ORDER BY updated_at` recovers FIFO order.
 *   - Row <-> object mapping: DB columns are snake_case (`created_at`,
 *     `progress_pct`, ...); the domain `JobsTableRow` is camelCase. Mapping
 *     is centralised in `rowToJob` so callers never see a raw better-sqlite3
 *     row.
 *   - Single-writer discipline: the caller (main thread) owns the DB. This
 *     DAO does not open its own connection — it uses the handle passed by
 *     `openLocalStore`.
 */
import type { Database, Statement } from 'better-sqlite3';

import type { JobStatus, JobsTableRow } from '../../../contracts/local-store.contract.js';

/**
 * Insert payload — everything except the timestamps, which the DAO fills in
 * from `Date.now()` so the caller cannot smuggle inconsistent clocks.
 */
export interface InsertJobInput {
  id: string;
  kind: string;
  status: JobStatus;
  progressPct?: number;
  label?: string;
  result?: string;
  error?: string;
}

/**
 * Status-update payload. `result` / `error` are only meaningful for terminal
 * statuses (`succeeded` / `failed` / `cancelled`) but the DAO does not
 * enforce that pairing — that is a job-manager concern.
 */
export interface UpdateJobStatusInput {
  id: string;
  status: JobStatus;
  result?: string;
  error?: string;
}

/**
 * Progress-update payload. `progressPct` is expected to be `0..100`; callers
 * outside the manager should not exceed that range but the DAO does not
 * clamp — the CHECK constraint in the schema catches obvious drift.
 */
export interface UpdateJobProgressInput {
  id: string;
  progressPct: number;
  label?: string;
}

/**
 * Public surface of the jobs DAO. Every method is synchronous (better-sqlite3
 * is a synchronous binding); callers that need async semantics should wrap
 * at a higher layer.
 */
export interface JobsDao {
  insert(input: InsertJobInput): void;
  updateStatus(input: UpdateJobStatusInput): void;
  updateProgress(input: UpdateJobProgressInput): void;
  getById(id: string): JobsTableRow | undefined;
  listPending(): JobsTableRow[];
  cancelById(id: string, error?: string): void;
}

interface JobRowRaw {
  id: string;
  kind: string;
  status: string;
  created_at: number;
  updated_at: number;
  progress_pct: number | null;
  label: string | null;
  result: string | null;
  error: string | null;
}

const KNOWN_STATUSES: readonly JobStatus[] = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
];

function isJobStatus(value: string): value is JobStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(value);
}

/**
 * Map a raw better-sqlite3 row to the `JobsTableRow` contract shape.
 *
 * Undefined vs null: SQLite returns `null` for missing values, the contract
 * uses `undefined` (optional properties) — normalise once at this boundary.
 */
function rowToJob(row: JobRowRaw): JobsTableRow {
  if (!isJobStatus(row.status)) {
    // The CHECK constraint should catch this, but if a hand-edit slipped
    // past the schema we surface a clear error rather than mis-typing.
    throw new Error(`jobs.status has invalid value: ${row.status}`);
  }
  const mapped: JobsTableRow = {
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.progress_pct !== null) {
    mapped.progressPct = row.progress_pct;
  }
  if (row.label !== null) {
    mapped.label = row.label;
  }
  if (row.result !== null) {
    mapped.result = row.result;
  }
  if (row.error !== null) {
    mapped.error = row.error;
  }
  return mapped;
}

interface PreparedStatements {
  insert: Statement;
  updateStatus: Statement;
  updateProgress: Statement;
  getById: Statement;
  listPending: Statement;
  cancelById: Statement;
}

function prepareStatements(db: Database): PreparedStatements {
  return {
    insert: db.prepare(
      `INSERT INTO jobs (
         id, kind, status, created_at, updated_at,
         progress_pct, label, result, error
       ) VALUES (
         @id, @kind, @status, @createdAt, @updatedAt,
         @progressPct, @label, @result, @error
       )`,
    ),
    updateStatus: db.prepare(
      `UPDATE jobs
         SET status = @status,
             updated_at = @updatedAt,
             result = COALESCE(@result, result),
             error = COALESCE(@error, error)
       WHERE id = @id`,
    ),
    updateProgress: db.prepare(
      `UPDATE jobs
         SET progress_pct = @progressPct,
             updated_at = @updatedAt,
             label = COALESCE(@label, label)
       WHERE id = @id`,
    ),
    getById: db.prepare('SELECT * FROM jobs WHERE id = @id'),
    listPending: db.prepare(
      "SELECT * FROM jobs WHERE status = 'pending' ORDER BY updated_at ASC",
    ),
    cancelById: db.prepare(
      `UPDATE jobs
         SET status = 'cancelled',
             updated_at = @updatedAt,
             error = COALESCE(@error, error)
       WHERE id = @id`,
    ),
  };
}

/**
 * Construct a `JobsDao` bound to `db`. Prepared statements are compiled once
 * at construction time so hot-path operations do not re-parse SQL.
 */
export function createJobsDao(db: Database): JobsDao {
  const stmts = prepareStatements(db);

  return {
    insert(input: InsertJobInput): void {
      const now = Date.now();
      stmts.insert.run({
        id: input.id,
        kind: input.kind,
        status: input.status,
        createdAt: now,
        updatedAt: now,
        progressPct: input.progressPct ?? null,
        label: input.label ?? null,
        result: input.result ?? null,
        error: input.error ?? null,
      });
    },
    updateStatus(input: UpdateJobStatusInput): void {
      stmts.updateStatus.run({
        id: input.id,
        status: input.status,
        updatedAt: Date.now(),
        result: input.result ?? null,
        error: input.error ?? null,
      });
    },
    updateProgress(input: UpdateJobProgressInput): void {
      stmts.updateProgress.run({
        id: input.id,
        progressPct: input.progressPct,
        updatedAt: Date.now(),
        label: input.label ?? null,
      });
    },
    getById(id: string): JobsTableRow | undefined {
      const row = stmts.getById.get({ id }) as JobRowRaw | undefined;
      return row === undefined ? undefined : rowToJob(row);
    },
    listPending(): JobsTableRow[] {
      const rows = stmts.listPending.all() as JobRowRaw[];
      return rows.map(rowToJob);
    },
    cancelById(id: string, error?: string): void {
      stmts.cancelById.run({
        id,
        updatedAt: Date.now(),
        error: error ?? null,
      });
    },
  };
}
