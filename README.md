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

## Contributing

Open [`HANDOFF.md`](HANDOFF.md) for a developer-focused run/build/test
walkthrough, plus a rundown of dormant CI and per-OS artefacts.
