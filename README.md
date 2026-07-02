# Cairn

Local-first, cross-platform desktop application scaffolded on Electron +
TypeScript + Vite. This repository holds the foundation only — an empty
window titled **Cairn**, quality gates, dormant CI, a packaging skeleton, and
the placeholder contracts every later task extends.

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
| pnpm seed | Run the seed script stub via `tsx` (no-op in this release). |

A `postinstall` hook runs `@electron/rebuild` so the `better-sqlite3` native
binary matches the current Electron ABI on first install.

## Quick start

```bash
pnpm install         # installs deps and rebuilds native modules
pnpm dev             # opens the Cairn window
```

## Where things live

See [`docs/architecture/repo-layout.md`](docs/architecture/repo-layout.md) for
the canonical directory layout, and [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md)
for the stack decision, rejected alternatives, and the intended keychain
adapter.

## IPC service API

The renderer talks to core exclusively over the typed
`window.cairn` bridge exposed by `src/preload/index.ts`. The full
surface — 16 op namespaces, 10 server → UI events, the `apiVersion`
handshake, and the `CoreServiceResult<T>` shape — is enumerated in
[`docs/architecture/service-api.md`](docs/architecture/service-api.md).

Design decisions for the transport and background-job model are captured
in:

- [`docs/adr/0002-ipc-transport-and-worker.md`](docs/adr/0002-ipc-transport-and-worker.md)
  — `ipcMain.handle` + preload `contextBridge` + `node:worker_threads`
  and the single-writer better-sqlite3 invariant.
- [`docs/adr/0003-core-service-result-typed-errors.md`](docs/adr/0003-core-service-result-typed-errors.md)
  — the discriminated `CoreServiceError` taxonomy (`validation_error`,
  `not_found`, `conflict`, `unavailable`, `forbidden`, `internal`,
  `not_implemented`).
- [`docs/adr/0004-local-store-jobs-table.md`](docs/adr/0004-local-store-jobs-table.md)
  — the `LocalStoreSchema` v2 bump and the `jobs` row shape.

Business logic on most namespaces is still stubbed and returns
`{ ok:false, error:{ code:'not_implemented' } }` uniformly. Only
`system.getStatus`, `system.getApiVersion`, `jobs.start`, and
`jobs.cancel` have real implementations at foundation time.

## Contributing

Open [`HANDOFF.md`](HANDOFF.md) for a developer-focused run/build/test
walkthrough, plus a rundown of dormant CI and per-OS artefacts.
