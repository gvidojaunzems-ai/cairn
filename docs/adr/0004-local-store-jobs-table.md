# ADR 0004 — LocalStoreSchema jobs table (v2)

- **Status**: Accepted
- **Date**: 2026-07-02
- **Deciders**: Database / Backend jobs task
- **Consulted**: `docs/adr/0001-stack.md`, `docs/adr/0005-ipc-transport-and-worker.md`

## Context

The background-job manager (see ADR 0005) needs a durable place to
record job lifecycle so a crash mid-job leaves a recoverable row. The
existing `LocalStoreSchema` v1 has only `{ version: 1 }` — no table
descriptors.

## Decision

Bump `LocalStoreSchema.version` to `2` and add:

- `JobStatus` — the closed union `'pending' | 'running' | 'succeeded'
  | 'failed' | 'cancelled'`.
- `JobsTableRow` — the row shape stored in the `jobs` SQLite table:
  - `id: string` (primary key)
  - `kind: string`
  - `status: JobStatus`
  - `createdAt: number` (epoch ms)
  - `updatedAt: number` (epoch ms)
  - `progressPct?: number` (0..100)
  - `label?: string`
  - `result?: string` (JSON-serialised terminal result)
  - `error?: string` (user-safe terminal message)
- `CURRENT_LOCAL_STORE_SCHEMA_VERSION = 2` as a runtime constant so the
  migration runner can compare without duplicating the literal.

The physical SQLite table lives under `resolvePaths().data/cairn.db` and is
created by migration `src/main/db/migrations/0002-jobs-table.ts`. Columns
are stored snake_case (`created_at`, `progress_pct`, …); the DAO maps
to the camelCase contract shape at the read boundary.

## Rationale

- **Additive**: the jobs table did not previously exist in v1 entity DDL, so
  no data migration is required — only a schema creation on first upgrade.
- **Version bump signal**: the migration runner keys off
  `PRAGMA user_version`; bumping to `2` triggers the "create jobs table"
  step on any DB that reports v1.
- **Times as epoch millis**: index-friendly for `ORDER BY updated_at`
  and delta arithmetic; avoids the ISO-string parsing hop on every read.
- **`error` / `result` as `string`**: SQLite has no native JSON column
  — we store the pre-serialised text and let the DAO decode on demand.
- **Closed `JobStatus` union**: exhaustive `switch` blocks at every
  consumer catch a new lifecycle state at compile time.

## Migration

- `src/contracts/local-store.contract.ts` extended additively (types
  only — no runtime impact by itself).
- `src/main/db/migrations/0002-jobs-table.ts` creates the physical
  table with the appropriate CHECK constraint on `status`.
- `src/main/db/dao/jobs.ts` centralises `insert` / `updateStatus` /
  `updateProgress` / `getById` / `listPending` / `cancelById` with
  prepared statements bound to named parameters.
- Contract test `tests/contracts/local-store-jobs.test.ts` locks the
  version bump and the row shape.

## Consequences

- Adding a new terminal status (say `'timeout'`) requires a follow-up
  ADR — every consumer switch must be extended in the same change.
- Only the main thread writes to `jobs`; the worker communicates
  progress via `postMessage` and never opens a writable connection.
  This invariant is codified in ADR 0005.
- The migration runner MUST run during `openDatabase` / `openStore`
  before any DAO prepared statement is compiled, otherwise the missing
  table will surface as a hard fault.
