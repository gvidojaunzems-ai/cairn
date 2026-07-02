# ADR 0002 — IPC transport and worker-thread model

- **Status**: Accepted
- **Date**: 2026-07-02
- **Deciders**: Backend / transport task
- **Consulted**: `docs/adr/0001-stack.md`, `.aide-spec/spec-package.json`,
  `.claude/rules/general/security-practices.md`

## Context

The renderer and core communicate over Electron IPC. Growing the
preload's single `restart-app` channel into a typed service boundary
introduced two questions:

1. **Transport shape** — how do we expose 16 op namespaces + 10 events
   without weakening the contextIsolation:true / sandbox:true
   security posture?
2. **Background work** — where do long-running / CPU-bound jobs run?
   `utilityProcess`, `child_process`, and localhost servers are all
   available; we needed one answer.

## Decision

### Transport

- **Every op** is exposed via `ipcMain.handle('${namespace}.${op}',
  handler)`. Handlers dispatch through a router in
  `src/main/ipc/router.ts` that validates input via a Zod schema from
  `src/shared/ipc/schemas.ts` before calling the bound service.
- **Every service response** is a `CoreServiceResult<T>` (see ADR
  0003). No thrown exception ever crosses the IPC boundary — the
  router traps them and converts via `toCoreServiceError()`.
- **Every event** (`job.progress`, `job.done`, …; ten total) fans out
  via `webContents.send(eventName, payload)` from
  `src/main/ipc/event-bus.ts`.
- **The preload** exposes exactly `{ invoke, on, off, restartApp }`
  under `window.cairn`. `ipcRenderer` is NEVER re-exported.
  `contextIsolation:true` and `sandbox:true` remain unchanged on the
  main `BrowserWindow`.

### Background work

- Long / CPU-bound jobs run inside `node:worker_threads` spawned from
  the main process. NOT `utilityProcess`, NOT `child_process`, NOT a
  localhost server.
- The main thread hosts a `JobManager` (`src/main/jobs/job-manager.ts`)
  that owns a single worker instance, persists lifecycle to the
  `jobs` SQLite table (see ADR 0004), and emits `job.progress` /
  `job.done` events over the event bus.
- Progress events are throttled to **at most one every 50 ms per job**
  to keep the IPC channel from flooding the renderer.

### Single-writer better-sqlite3 invariant

The worker thread **NEVER** opens a writable better-sqlite3
connection. Every write to `jobs` (and any future table) is issued
from the main thread. This invariant protects against DB corruption
from concurrent writes across threads and simplifies the migration
runner's ownership model.

## Rationale

- **`ipcMain.handle`** natively marshals a Promise return value into
  the renderer's `ipcRenderer.invoke` — no manual reply-channel
  bookkeeping.
- **Zod at the boundary** catches malformed renderer input before it
  reaches business logic; keeps stubs uniformly `not_implemented` (S12).
- **`webContents.send`** is fire-and-forget which matches the
  server-push semantics of `job.progress` and `notification.emit`.
- **`worker_threads` over `utilityProcess`**: worker_threads shares the
  V8 heap with main (cheaper spawn) and reuses the already-rebuilt
  better-sqlite3 binary. utilityProcess is a separate OS process with
  its own module cache; overkill for our current needs.
- **Single-writer**: better-sqlite3 is synchronous; running two writers
  against the same file requires WAL mode + serialisation. Keeping
  writes on the main thread lets the migration runner and DAO share a
  single prepared-statement cache.
- **50 ms throttle**: a tighter budget can flood the renderer's event
  loop with re-renders; a looser one visibly stalls progress bars.

## Consequences

- Growing the API surface is a matter of adding an entry to
  `OP_NAMESPACES` + a Zod schema + a service handler + a contract test.
  No new IPC channel machinery.
- The renderer bundle MUST NOT import Zod or `node:*` modules; the
  architecture lint test (`tests/meta/architecture-lint.test.ts`)
  enforces this.
- If the app ever needs true process isolation (e.g. running an
  untrusted native module), the worker-thread choice must be revisited.
- The preload's typed surface is now the security choke point. Every
  new op that lands there requires a code review pass against
  `.claude/rules/general/security-practices.md`.

## Rejected alternatives

- **localhost HTTP/WebSocket server** — would require relaxing
  contextIsolation, complicates packaging (port collisions), and
  duplicates what Electron IPC already provides. Rejected.
- **utilityProcess** — heavier spawn cost, separate module cache,
  requires an extra rebuild for native modules on some platforms.
  Rejected in favour of worker_threads.
- **child_process** — slowest of the three (full OS process + Node
  startup); no shared memory. Rejected.
- **Custom binary protocol over MessagePort** — unnecessary complexity
  for JSON-cloneable payloads. Rejected.
