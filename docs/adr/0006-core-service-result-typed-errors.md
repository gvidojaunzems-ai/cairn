# ADR 0003 — CoreServiceResult typed error taxonomy

- **Status**: Accepted
- **Date**: 2026-07-02
- **Deciders**: Backend / Contracts task
- **Consulted**: `docs/adr/0001-stack.md`, `.aide-spec/spec-package.json`

## Context

The initial `CoreServiceResult<T>` (see `docs/adr/0001-stack.md` and
`src/contracts/core-service.contract.ts`) modelled failures as a
plain `error: string`. That was serviceable for the empty foundation but
insufficient for a real IPC transport, where callers need to
distinguish:

- transient failures (`unavailable`) from user-input problems
  (`validation_error`),
- missing entities (`not_found`) from denied access (`forbidden`),
- generic core faults (`internal`) from "the code path is not written
  yet" (`not_implemented`).

We also need every response to carry an `apiVersion` so the renderer can
detect a mismatched core (e.g. after an upgrade) before dispatching.

## Decision

Extend `CoreServiceResult<T>` **additively** into a discriminated union:

```ts
type CoreServiceResult<T> =
  | { ok: true;  data: T;                       apiVersion: ApiVersion }
  | { ok: false; error: CoreServiceError;       apiVersion: ApiVersion };
```

`CoreServiceError` is a discriminated union keyed by `code`:

- `validation_error` — Zod parse failure at the IPC boundary.
- `not_found` — the referenced entity does not exist.
- `conflict` — write conflicts with existing state.
- `unavailable` — transient dependency failure (network, worker, DB).
- `forbidden` — the caller is not authorised.
- `internal` — an unexpected core-side fault; message is user-safe.
- `not_implemented` — the op exists in the descriptor but has no
  implementation yet. Every stub returns this.

Each variant carries `{ code, message, details? }`. The `message` field
mirrors the old `error: string` value for display; consumers migrate
from `result.error` to `result.error.message`.

An `apiVersion` string (`'1.0.0'`) is surfaced on both arms via
`API_VERSION` in `src/shared/ipc/api-version.ts`.

## Rationale

- **Additive**: we extend rather than replace; existing consumers that
  only checked `ok` continue to work.
- **Discriminated on `code`**: downstream `switch (error.code)` blocks
  are exhaustive at compile time.
- **`details?: unknown`**: carries structured debugging info (`ZodIssue[]`
  for `validation_error`) without forcing callers to unpack it.
- **`apiVersion` on every response**: cheap version handshake, no extra
  round-trip.
- **Zod stays out of contracts**: schemas live under
  `src/shared/ipc/schemas.ts` so `src/contracts/*.ts` remain
  interface-only (openQuestion #7 resolution).

## Migration

- `src/contracts/core-service.contract.ts` is bumped in-place because
  the change is additive at the type level.
- Every new service returns `okResult(data)` or `errResult(makeError(...))`
  from `src/main/ipc/errors.ts`.
- The router in `src/main/ipc/router.ts` traps thrown exceptions and
  converts them via `toCoreServiceError()` so no stack trace ever
  escapes the IPC boundary.
- Contract tests under `tests/contracts/core-service-typed-error.test.ts`
  lock the new shape.

## Consequences

- `CoreServiceResult<T>` is no longer trivially string-comparable on
  the error path — consumers must use `result.error.message`. This is
  a source-level migration but not a runtime break because the old
  shape was never distributed.
- Adding a new `code` requires a follow-up ADR (every consumer switch
  must be extended in the same change).
- `apiVersion` must be bumped in `src/shared/ipc/api-version.ts` any
  time the transport contract changes in a way the renderer cannot
  detect otherwise.
