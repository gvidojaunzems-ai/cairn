# HANDOFF — Cairn foundation

This is a developer handoff for the Cairn desktop-app foundation. Everything
below assumes a clean checkout on a machine that meets the prerequisites.

## Toolchain requirements

- **Node.js** — 20 LTS (`node >= 20`). Nothing below 20 is supported; 22 works
  but is not the CI target.
- **pnpm** — 9 or newer (`pnpm >= 9`). npm/yarn are unsupported (pnpm's strict
  hoisting and workspaces are baked into the layout).
- Native-module toolchain per OS (used by `better-sqlite3` + `@electron/rebuild`):
  - **Windows**: MSVC Build Tools with the *Desktop development with C++* workload
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential` + `python3` (+ `libsecret-1-dev` when the
    keychain adapter lands)

## Running the app

```bash
pnpm install    # deps + postinstall runs @electron/rebuild
pnpm dev        # opens the Cairn window (title "Cairn")
```

`pnpm dev` runs `electron-vite dev`, which starts the Vite dev server for the
renderer and boots Electron pointing at it. Cold start on a modern laptop is
well under the 4-second budget.

## Building

```bash
pnpm build      # emits out/main, out/preload, out/renderer
pnpm package    # per-OS installer via electron-builder
                # add --win, --mac, or --linux to target one OS
```

Installer artefacts land in `dist/installers/`.

## Running the test suite

```bash
pnpm test           # Vitest — src + tests + docs + workflow structure
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit for main and renderer
pnpm format         # Prettier (rewrite in place)
```

The native-module smoke test (`tests/main/native-modules.smoke.test.ts`) is
gated behind `CAIRN_RUN_NATIVE_SMOKE=1` because it requires the rebuilt
better-sqlite3 binary and the sqlite-vec extension to be on disk.

## Project locations

| Path | Purpose |
|------|---------|
| `src/main/` | Electron main-process code (IPC, window lifecycle, error boundary). |
| `src/main/ipc/` | Namespaced IPC router, Zod validation, event bus, `CoreServiceError` factory. |
| `src/main/services/` | 16 per-namespace service objects (mostly `not_implemented` stubs). |
| `src/main/workers/` | `node:worker_threads` background-worker script. |
| `src/main/jobs/` | `JobManager`, job registry, sample-long-job fixture, worker message shapes. |
| `src/main/db/` | Canonical SQLite store: migrations, entity DAOs, jobs DAO, `openStore()`. |
| `src/preload/` | Preload script exposing the typed `window.cairn` bridge to the renderer. |
| `src/renderer/` | UI layer: React app, hooks, global CSS. |
| `src/renderer/ipc/` | Renderer-side typed `CairnRendererClient` + `useCoreService` hook. |
| `src/shared/` | Cross-process utilities (paths, logger, feature flags, i18n stub). |
| `src/shared/ipc/` | IPC descriptor layer — 16 op namespaces, 10 event names, `apiVersion`, Zod schemas. |
| `src/contracts/` | Five stable contract placeholders — extend additively. |
| `tests/` | Vitest suites mirroring `src/`, plus meta/CI/docs checks. |
| `scripts/` | Node scripts (`seed.ts`, `notarize.js`, `verify-native-modules.ts`). |
| `build/` | electron-builder resources (icon, entitlements). |
| `docs/` | ADRs and architecture docs. See `docs/adr/0001-stack.md` + `docs/architecture/service-api.md`. |
| `dist/installers/` | Packaged installers (git-ignored). |
| `out/` | Compiled bundles (git-ignored). |

## Per-OS data locations

On first run the app creates:

| OS | Data | Cache | Logs |
|----|------|-------|------|
| Windows | `%APPDATA%\Cairn` | `%LOCALAPPDATA%\Cairn\cache` | `%APPDATA%\Cairn\logs` |
| macOS | `~/Library/Application Support/Cairn` | `~/Library/Caches/Cairn` | `~/Library/Logs/Cairn` |
| Linux | `$XDG_DATA_HOME/cairn` (or `~/.local/share/cairn`) | `$XDG_CACHE_HOME/cairn` | `$XDG_STATE_HOME/cairn/logs` |

## Feature flags

Runtime feature flags live at `{data-dir}/feature-flags.json` and can be
overridden by env vars using the `FF_<UPPER_SNAKE>` convention (e.g.
`FF_MY_FLAG=true`). Every flag defaults to `false` so incomplete work ships
disabled.

## CI status — dormant

Workflows live under `.github/workflows/` and are **dormant**: the repo is
not yet hosted on GitHub. They activate automatically on the first push.
Validate structure via `pnpm test tests/ci` — do **not** wait for a live CI
result until the repo is pushed.

Every `uses:` entry is pinned to a full 40-character commit SHA per the root
security policy. When updating an action, re-verify the SHA against the
released tag.

## Known caveats

Consolidated from the foundation-run risk analysis. None block bring-up, but
each is a repeatable trap worth knowing before you file a bug.

- **`pnpm format` rewrites files** — the script is `prettier --write .`, not
  `--check`. Use `pnpm format` locally to fix formatting; do **not** rely on
  it as a CI-style quality gate. If you need a check-only invocation, run
  `pnpm exec prettier --check .` directly.
- **Native-toolchain required at install time** — `pnpm install` triggers
  `@electron/rebuild` for `better-sqlite3`. A workstation without MSVC Build
  Tools (Windows), Xcode CLT (macOS), or `build-essential` + `python3`
  (Linux) will fail during install, not at runtime.
- **Installers are unsigned** — `pnpm package` produces artefacts without
  Authenticode (Windows) or notarisation (macOS). Expect SmartScreen and
  Gatekeeper warnings on end-user machines. Signing hooks in
  `electron-builder.yml` and `scripts/notarize.js` are deliberate
  placeholders (see ADR 0001 Consequences).
- **`@napi-rs/keyring` is not yet a dependency** — the intended keychain
  adapter is documented in ADR 0001, but `src/shared/keychain.ts` currently
  returns a `not implemented` Result. Nothing at runtime depends on the
  package; add it in the hardening task that lands the real adapter.
- **Logger redaction is on by default** — the shared logger scrubs secret-
  shaped values across three axes (blocklisted context keys, message regex
  sweep, nested contexts). If a legitimate value looks like a secret
  (`sk-*`, `ghp_*`, `Bearer *`, long hex/base64), it will be masked in logs.

## IPC service surface

The renderer talks to core over a typed IPC bridge exposed as
`window.cairn` in `src/preload/index.ts`. The full surface — 16 op
namespaces, 10 server → UI events, the `apiVersion` handshake constant,
and the `CoreServiceResult<T>` shape — is enumerated in
[`docs/architecture/service-api.md`](docs/architecture/service-api.md).
That document is generated verbatim from `src/shared/ipc/operations.ts`,
`src/shared/ipc/events.ts`, and `src/shared/ipc/api-version.ts`; the
parity test at `tests/docs/service-api.test.ts` fails if it drifts.

Business logic is still stubbed on most namespaces — every stub returns
`{ ok:false, error:{ code:'not_implemented' } }` uniformly. Only
`system.getStatus`, `system.getApiVersion`, `jobs.start`, and
`jobs.cancel` are wired end-to-end at foundation time.

### Runtime dependency note

`zod@3.23.8` is now a runtime dependency (validated inputs at the IPC
boundary via `src/shared/ipc/schemas.ts`). It is externalised in the
main bundle by `electron.vite.config.ts`; the renderer bundle must NOT
import it (the architecture lint test at
`tests/meta/architecture-lint.test.ts` enforces this).

### Local-store schema v2

`LocalStoreSchema.version` bumped from `1` to `2`. The v2 addition is
the `jobs` SQLite table (see ADR 0004). The migration runner at
`src/main/db/migrations/0002-jobs-table.ts` idempotently creates the table on first
upgrade; only the main thread writes to it (see ADR 0002).

## Architecture

See [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md) for the stack decision
and rejected alternatives, and [`docs/architecture/repo-layout.md`](docs/architecture/repo-layout.md)
for the full directory layout.

New ADRs landed with the IPC transport work package:

- [`docs/adr/0005-ipc-transport-and-worker.md`](docs/adr/0005-ipc-transport-and-worker.md)
  — `ipcMain.handle` + `contextBridge` + `node:worker_threads`, plus the
  single-writer better-sqlite3 invariant.
- [`docs/adr/0006-core-service-result-typed-errors.md`](docs/adr/0006-core-service-result-typed-errors.md)
  — the discriminated `CoreServiceError` taxonomy and the additive
  extension of `CoreServiceResult<T>`.
- [`docs/adr/0004-local-store-jobs-table.md`](docs/adr/0004-local-store-jobs-table.md)
  — the `jobs` row shape and the `LocalStoreSchema` v2 bump.
