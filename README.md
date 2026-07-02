# Cairn

Local-first, cross-platform desktop application scaffolded on Electron +
TypeScript + Vite. The foundation ships the empty window titled **Cairn**,
quality gates, dormant CI, a packaging skeleton, and the embedded data
layer: a `better-sqlite3` + `sqlite-vec` store with a forward-only
migration runner, typed DAOs, an OS-keychain adapter with an
AES-256-GCM encrypted-file fallback, and a fixture seed runner.

## Prerequisites

- **Node.js** 20 LTS (`node >= 20`)
- **pnpm** 9 or newer (`pnpm >= 9`)
- Native-module toolchain per OS (used by `better-sqlite3` + `@electron/rebuild`):
  - **Windows**: Visual Studio 2022 Build Tools with the *Desktop development
    with C++* workload
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `python3`, and `libsecret-1-dev`
    (needed when the future keychain adapter lands)

## Scripts

| Command | What it does |
|---------|--------------|
| pnpm dev | Start Electron in dev mode with Vite HMR — opens a Cairn window. |
| pnpm build | Compile main + preload + renderer bundles to `out/`. |
| pnpm package | Produce a per-OS installer via electron-builder (add `--win`, `--mac`, `--linux`). |
| pnpm test | Run the full Vitest suite. |
| pnpm lint | Lint `src/`, `tests/`, and `scripts/` with ESLint. |
| pnpm format | Format the tree with Prettier. |
| pnpm typecheck | Type-check main and renderer projects with `tsc --noEmit`. |
| pnpm seed | Populate a freshly-migrated `cairn.db` with fixture data (5 people, 6 PoC projects, charter, news/docs/tickets/WIP signals). |

A `postinstall` hook runs `@electron/rebuild` so the `better-sqlite3` native
binary matches the current Electron ABI on first install.

## Quick start

```bash
pnpm install         # installs deps and rebuilds native modules
pnpm dev             # opens the Cairn window
```

## Where things live

- [`docs/architecture/repo-layout.md`](docs/architecture/repo-layout.md) —
  canonical directory layout.
- [`docs/architecture/domain-model.md`](docs/architecture/domain-model.md) —
  entity shapes and status enums.
- [`docs/architecture/store-schema.md`](docs/architecture/store-schema.md) —
  on-disk `cairn.db` schema and migration checklist.
- [`docs/architecture/service-api.md`](docs/architecture/service-api.md) —
  typed IPC service surface (16 op namespaces, 10 server → UI events).
- [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md) — stack decision.
- [`docs/adr/0002-keychain-and-encrypted-fallback.md`](docs/adr/0002-keychain-and-encrypted-fallback.md) —
  keychain adapter + AES-256-GCM fallback.
- [`docs/adr/0003-local-store-migrations.md`](docs/adr/0003-local-store-migrations.md) —
  forward-only migration runner.
- [`docs/adr/0005-ipc-transport-and-worker.md`](docs/adr/0005-ipc-transport-and-worker.md) —
  IPC transport and background worker model.
- [`docs/adr/0006-core-service-result-typed-errors.md`](docs/adr/0006-core-service-result-typed-errors.md) —
  typed `CoreServiceError` taxonomy.
- [`docs/adr/0004-local-store-jobs-table.md`](docs/adr/0004-local-store-jobs-table.md) —
  local store `jobs` table (schema v2).

## IPC service API

The renderer talks to core exclusively over the typed
`window.cairn` bridge exposed by `src/preload/index.ts`. The full
surface — 16 op namespaces, 10 server → UI events, the `apiVersion`
handshake, and the `CoreServiceResult<T>` shape — is enumerated in
[`docs/architecture/service-api.md`](docs/architecture/service-api.md).

Business logic on most namespaces is still stubbed and returns
`{ ok:false, error:{ code:'not_implemented' } }` uniformly. Only
`system.getStatus`, `system.getApiVersion`, `jobs.start`, and
`jobs.cancel` have real implementations at foundation time.

## Contributing

Open [`HANDOFF.md`](HANDOFF.md) for a developer-focused run/build/test
walkthrough, plus a rundown of dormant CI and per-OS artefacts.
