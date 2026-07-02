# ADR 0007 — IPC catalog aligned with Spec 03

## Context

The foundation scaffold (ADR 0005) shipped a simplified IPC surface (36 ops, 10 legacy events). Spec 03 defines the canonical Core Service API with ~70 operations and 10 domain events required by features 04–19.

## Decision

- Bump `API_VERSION` to **2.0.0**.
- Replace operation names with the Spec 03 catalog (see `docs/architecture/service-api.md`).
- Replace event catalog with Spec 03 events: `sync.updated`, `job.progress`, `job.done`, `signals.updated`, `news.updated`, `budget.updated`, `meeting.partial`, `meeting.proposals`, `setup.progress`, `toast`.
- Remove scaffold ops (`git.list`, `today.get`, `ai.chat`, etc.) — no backward compatibility shim.

## Consequences

- All services, renderer screens, contract tests, and `service-api.md` updated atomically.
- Job manager continues emitting `job.progress` / `job.done`; `job.cancelled` removed (cancellation uses `job.done` with `error.code = cancelled`).
- Features subscribe to `sync.updated` and re-fetch instead of `sync.done`.
