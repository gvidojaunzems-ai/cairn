# Domain model

Canonical description of the Cairn domain model — the entities persisted by
the embedded local store (`cairn.db`), and the closed status enums each
entity honors.

The typed contracts live in [`src/contracts/domain-model.contract.ts`](../../src/contracts/domain-model.contract.ts).
The DDL that creates the tables lives in
[`src/main/db/migrations/0001-init.ts`](../../src/main/db/migrations/0001-init.ts).
This document is the human-readable summary — every entity below has an
associated table (see [store-schema.md](./store-schema.md)) and a
DAO under `src/main/db/dao/`.

## Conventions

- **Identity**: every row carries `id TEXT PRIMARY KEY`.
- **Timestamps**: every row carries `created_at TEXT NOT NULL` and
  `updated_at TEXT NOT NULL`, both UTC ISO-8601 strings.
- **Status enums**: closed unions enforced by SQLite `CHECK` constraints.
  Adding a new state is a breaking schema change and requires a versioning ADR.
- **Secrets**: no entity carries a secret. Secrets live in the OS keychain
  (see [ADR 0002](../adr/0002-keychain-and-encrypted-fallback.md)).

## Entities

### people

Squad members and other contributors ingested from git commit authors and
news. The five named fixture people are **Gvido, Lars, Maria, Priya, Tom**.

- Fields: `id`, `name`, `role?`, `email?`, `avatar_url?`, `status`,
  `created_at`, `updated_at`.
- **Status enum**: `active | inactive | archived` (default `active`).

### projects

The unit of squad work. Six named PoC projects ship as fixtures (see the
seed runner in `src/main/db/fixtures/projects.ts`).

- Fields: `id`, `name`, `description?`, `status`, `created_at`, `updated_at`.
- **Status enum**: `active | paused | completed | archived` (default `active`).

### charters

Long-form project charters (e.g. the `poc-vector-search` charter). Body is
Markdown; binary attachments live in the on-disk attachments folder rather
than the DB.

- Fields: `id`, `project_id` → `projects(id)` (CASCADE on delete), `title`,
  `body`, `created_at`, `updated_at`.

### knowledge_items

Fundamental ingest surface — every later concept (article, note, snippet)
narrows this shape.

- Fields: `id`, `type`, `content`, `source?`, `created_at`, `updated_at`.

### news_topics

Curated topics that group news items.

- Fields: `id`, `name`, `description?`, `created_at`, `updated_at`.

### news_items

External news pulled from RSS / GitHub / manual entry. Long-form articles
live in `docs` (see below); this table stores summary rows.

- Fields: `id`, `topic_id?` → `news_topics(id)` (SET NULL on delete), `title`,
  `summary?`, `url?`, `source?`, `published_at?`, `created_at`, `updated_at`.

### docs

Long-form documents (design notes, ADR mirrors, memos). Distinct from
`knowledge_items` which is the generic ingest surface.

- Fields: `id`, `project_id?` → `projects(id)` (SET NULL on delete), `title`,
  `url?`, `content_hash?`, `created_at`, `updated_at`.

### tickets

Issues / tickets tracked in the local store (mirrors GitHub issues or
hand-entered).

- Fields: `id`, `project_id?` → `projects(id)` (SET NULL on delete),
  `external_id?`, `title`, `status`, `assignee_id?` → `people(id)`
  (SET NULL on delete), `url?`, `created_at`, `updated_at`.
- **Status enum**: `open | in_progress | blocked | done | closed`
  (default `open`).

### wip_signals

"Work in progress" signals — commits, branches, and other observable work
Cairn surfaces to the user. Sourced from git commit metadata.

- Fields: `id`, `entity_id`, `entity_type`, `summary`, `status`, `source?`,
  `created_at`, `updated_at`.
- **Status enum**: `active | resolved | muted` (default `active`).

### updates

Free-form updates attached to a project (status updates, weekly notes).

- Fields: `id`, `project_id` → `projects(id)` (CASCADE on delete),
  `author_id?` → `people(id)` (SET NULL on delete), `content`,
  `created_at`, `updated_at`.

### decisions

Recorded decisions scoped to a project (ADRs, lightweight decision logs).

- Fields: `id`, `project_id?` → `projects(id)` (SET NULL on delete), `title`,
  `body`, `status`, `decided_by?` → `people(id)` (SET NULL on delete),
  `created_at`, `updated_at`.
- **Status enum**: `proposed | accepted | rejected | superseded`
  (default `proposed`).

### apps

Applications tracked by the squad (dashboards, integrations, third-party
tools).

- Fields: `id`, `name`, `url?`, `category?`, `description?`, `created_at`,
  `updated_at`.

### meetings

Meeting records — agenda, attendees (stored as a JSON array of person ids in
`attendee_ids`), and outcome notes.

- Fields: `id`, `project_id?` → `projects(id)` (SET NULL on delete), `title`,
  `attendee_ids` (JSON string, default `'[]'`), `agenda?`, `outcome?`,
  `started_at?`, `ended_at?`, `created_at`, `updated_at`.

### action_items

Actions surfaced from a meeting.

- Fields: `id`, `meeting_id?` → `meetings(id)` (CASCADE on delete),
  `owner_id?` → `people(id)` (SET NULL on delete), `description`, `status`,
  `due_date?`, `created_at`, `updated_at`.
- **Status enum**: `open | in_progress | done | cancelled` (default `open`).

### reports

Rendered reports (weekly summaries, project retrospectives).

- Fields: `id`, `project_id?` → `projects(id)` (SET NULL on delete), `title`,
  `content`, `created_at`, `updated_at`.

### feeds

RSS / Atom / GitHub feeds Cairn polls for `news_items`.

- Fields: `id`, `name`, `url`, `feed_type`, `enabled` (0 or 1, default 1),
  `last_fetched_at?`, `created_at`, `updated_at`.

### budget_ledger

Lightweight ledger for tracking project spend (currency defaults to `USD`).

- Fields: `id`, `project_id?` → `projects(id)` (SET NULL on delete),
  `amount`, `currency` (default `'USD'`), `description?`, `ledger_date`,
  `created_at`, `updated_at`.

### jobs

Background jobs orchestrated by the main process (fetch feeds, run
embeddings, sync the team repo).

- Fields: `id`, `job_type`, `status`, `payload?`, `error?`, `started_at?`,
  `completed_at?`, `created_at`, `updated_at`.
- **Status enum**: `pending | running | done | failed | cancelled`
  (default `pending`).

### sync_state

Per-entity cursor tracking for external syncs (git, GitHub, RSS).

- Fields: `id`, `entity_type` (UNIQUE), `last_synced_at?`, `cursor?`,
  `created_at`, `updated_at`.

### settings_kv (`settings`)

Free-form key-value settings scoped by key namespace. **Never used for
secrets** — secrets live in the OS keychain
(see [ADR 0002](../adr/0002-keychain-and-encrypted-fallback.md)).

- Fields: `key TEXT PRIMARY KEY`, `value`, `updated_at`.

### vector_metadata + vec_items

Vector rows backing sqlite-vec. `vec_items` is a `vec0` virtual table
holding the packed float32 embeddings; `vector_metadata` is the companion
regular table joined on `rowid` for metadata filtering (`entity_type`,
`entity_id`). See [store-schema.md](./store-schema.md#vector-storage) for
the full contract and rationale.

## Status-enum reference

| Entity        | Enum values                                              |
|---------------|----------------------------------------------------------|
| people        | `active`, `inactive`, `archived`                         |
| projects      | `active`, `paused`, `completed`, `archived`              |
| tickets       | `open`, `in_progress`, `blocked`, `done`, `closed`       |
| wip_signals   | `active`, `resolved`, `muted`                            |
| decisions     | `proposed`, `accepted`, `rejected`, `superseded`         |
| action_items  | `open`, `in_progress`, `done`, `cancelled`               |
| jobs          | `pending`, `running`, `done`, `failed`, `cancelled`      |

Adding a value to any of the enums above is a **breaking schema change** —
it needs a follow-up migration and a supersession ADR that references
this document.

## Related

- [`docs/architecture/store-schema.md`](./store-schema.md) — table-level DDL
  summary and migration checklist.
- [`docs/adr/0003-local-store-migrations.md`](../adr/0003-local-store-migrations.md)
  — the forward-only migration strategy.
- [`docs/adr/0002-keychain-and-encrypted-fallback.md`](../adr/0002-keychain-and-encrypted-fallback.md)
  — where secrets go (not in the DB).
