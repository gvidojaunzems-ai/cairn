# ADR 0003 — Local-store migrations (forward-only, transactional, backup-first)

- **Status**: Accepted
- **Date**: 2026-07-02
- **Deciders**: Cairn embedded data-layer task
- **Consulted**: `.aide-spec/spec-package.json`, [ADR 0001](./0001-stack.md),
  [ADR 0002](./0002-keychain-and-encrypted-fallback.md)

## Context

Cairn is local-first. There is no cloud-side backup, no server to roll
back to, and installs live on user machines for the lifetime of the app.
The migration story therefore has to be:

- **Safe** — a partially-applied migration must never leave the DB in a
  torn state that the next boot can't detect.
- **Cheap** — a squad of 5–15 users per project, one process per
  machine, small DBs (megabytes, not gigabytes). We don't need
  streaming online migrations; a single-transaction apply is fine.
- **Auditable** — every DB open logs what version it's at and what got
  applied.
- **Newer-schema safe** — if the user drags a `cairn.db` created by a
  newer build onto an older build, that older build MUST fail cleanly
  before touching the file. Local-first data cannot be silently
  downgraded.

## Decision

### Forward-only versioning via `PRAGMA user_version`

The schema version is stored in SQLite's built-in `PRAGMA user_version`
(a 32-bit integer in the DB header). No separate `schema_version` table
is required and no join is needed to read it. Reads and writes of the
pragma are atomic against a running transaction, so the runner can
update it inside the same `BEGIN…COMMIT` as the DDL.

The migration registry
([`src/main/db/migrations/index.ts`](../../src/main/db/migrations/index.ts))
is an array of `{ version, name, description, up(db) }` entries with
sequential integer versions `1..N`. The runner asserts sequential
gap-free order at construction time so a mis-registered migration
surfaces as an immediate startup error, not a silent skip.

There is **no `down()`**. Migrations are forward-only.

### Transactional per-migration apply

Each migration is wrapped in a single `BEGIN…COMMIT`. If `up()` throws
the runner `ROLLBACK`s and rethrows the original error. The DB is left
at the last successfully applied version (never mid-migration).

Interpolating `migration.version` into the `PRAGMA user_version = N`
statement is safe because the value is a compile-time integer from the
registry — never user input. The rest of the DDL is emitted from
migration files via `db.exec(...)` on strings the code itself owns.

### Pre-migration backup

Before applying **any** pending migration the runner:

1. Runs `PRAGMA wal_checkpoint(TRUNCATE)` so the WAL is collapsed back
   into the main DB file; the copy will be a full snapshot rather than
   "main + separate WAL tail".
2. Copies `cairn.db` to
   `<dbPath>.<ISO-timestamp>.cairn.db.backup` (colon-free suffix so
   Windows is happy).

The backup runs only when the DB file already exists on disk (i.e. not
on first-run installs) and when a `dbPath` is passed to the runner
(so `:memory:` DBs used in tests skip the copy).

The transactional apply already covers most torn-write scenarios; the
backup is defence-in-depth for the "power cuts mid-flush and the file
system loses a WAL page" scenario.

### Newer-schema rejection

If `PRAGMA user_version > CODE_SCHEMA_VERSION`, the runner throws
`NewerSchemaVersionError` **without applying anything**. Attached to
the error is the current `PRAGMA integrity_check` result so the caller
can decide whether the DB is at least structurally sound before offering
a "restore from backup" path.

Bootstrap
([`src/main/index.ts`](../../src/main/index.ts)) catches this error,
shows an `ErrorBox` (`"Cairn — cannot start"`), and returns **before**
constructing the main window. It never writes to the DB.

## Rationale

- **Forward-only is a policy, not a limitation.** With no cloud
  rollback and a single-user desktop app, `down()` migrations create
  more risk than they mitigate. If a migration was wrong we ship a
  fix-forward migration.
- **`PRAGMA user_version` over a `schema_version` table.** The pragma
  is atomic, needs no join to read, and can be set in the same
  transaction as the DDL. A dedicated table would need its own
  bootstrap and its own indexes.
- **Backup before, not after.** A backup taken after applying a
  migration would be a backup of a state that may already be
  compromised. Copying first, applying second gives us a rollback path
  even in the theoretical case where the transaction commits but the
  filesystem loses the write.
- **Newer-schema errors are terminal.** A downgrade attempt is the one
  case we can detect cheaply and refuse. The alternative (attempting
  to open and hoping) is exactly how local-first apps corrupt user
  data.

## Rejected alternatives

- **Down migrations** — Every additional code path is a place for a
  bug. Forward-only is a defensible policy in a local-first app.
- **Separate `schema_version` table** — extra bookkeeping, extra
  bootstrap, no benefit over `PRAGMA user_version`.
- **`ATTACH DATABASE` for backup** — heavier than a file copy and
  offers no advantage for a small on-disk DB.
- **Skip the WAL checkpoint** — the resulting backup is
  "main + separate WAL", i.e. requires the WAL file to be alongside to
  be useful. Not what we want for a "one file, drop it in place"
  restore.
- **On-disk `backups/*.tar.gz`** — adds a compression step for no
  size win on tiny DBs.

## Consequences

- **First install**: no pre-migration backup (there is no file yet).
- **Existing install upgrading forward**: backup + apply-in-order. The
  runner logs `pre-migration backup created` and one
  `applying migration` line per migration.
- **Downgrade attempt**: hard-fail before the window is even
  constructed. User sees a native error dialog with the version
  numbers and a suggestion to upgrade Cairn or restore a compatible
  backup.
- **Test flexibility**: the runner accepts `RunMigrationsOptions` with
  `migrations`, `codeSchemaVersion`, and `dbPath` overrides so
  fixture-DB tests and `:memory:` DBs can exercise every branch
  without touching the real data directory.

## Follow-ups

- Retention policy for pre-migration backups — currently unlimited.
  Add a bounded rotation once we've observed real-world sizes.
- Surface the backup path in the UI after an upgrade so users can
  find it if they need to roll back.
- Consider a `migrate:check` helper script that prints the pending
  migrations without applying them — useful for support triage.
