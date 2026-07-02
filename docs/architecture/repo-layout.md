# Repo layout

Canonical directory structure for Cairn. Every later task should extend the
existing sections rather than inventing new top-level directories.

## UI layer

Everything the user sees runs in the Chromium renderer.

- `src/renderer/index.html` — the single entry document (declares `#root`).
- `src/renderer/main.tsx` — React root; mounts `<App />` under
  `<StrictMode>` + the top-level `<ErrorBoundary>`.
- `src/renderer/App.tsx` — the shell landmark. Currently renders an empty
  `<main aria-label={t('app.mainLandmark')} />`.
- `src/renderer/error-boundary.tsx` — React error boundary with a friendly
  fallback screen and a "Restart" button that IPCs `restart-app`.
- `src/renderer/hooks/use-color-scheme.ts` — reflects `prefers-color-scheme`.
- `src/renderer/hooks/use-reduced-motion.ts` — reflects
  `prefers-reduced-motion`.
- `src/renderer/styles/global.css` — visible focus-ring, WCAG-AA colour
  tokens, reduced-motion overrides.

## Core services

The Electron main process — window lifecycle, IPC handlers, platform
integration.

- `src/main/index.ts` — bootstrap. Runs the deterministic startup order:
  register error boundary → create data/cache/logs directories → open
  `cairn.db` + migrate → load local + team config → wire IPC → construct
  the `BrowserWindow` with `contextIsolation: true` + `sandbox: true`.
- `src/main/error-boundary.ts` — process-level `uncaughtException` and
  `unhandledRejection` handlers that funnel through the shared logger.
- `src/main/config/local-config.ts` — per-machine `local.config.json`
  loader under `resolvePaths().data`. Rejects unknown keys and drops any
  key that matches the secret-blocklist (never persists a secret).
- `src/main/config/team-config.ts` — team-repo config loader under
  `resolvePaths().data/team-repo`.
- `src/main/config/index.ts` — barrel export.
- `src/preload/index.ts` — the ONLY IPC bridge. Exposes a typed
  `window.cairn` surface via `contextBridge.exposeInMainWorld`.

## Embedded data layer

`src/main/db/` — the canonical local store. Every downstream feature
(service API, AI/search, git-sync, fixtures) reaches the DB through this
barrel export.

- `src/main/db/index.ts` — barrel: `openDatabase`, `runMigrations`,
  `NewerSchemaVersionError`, the schema constants, and every DAO.
- `src/main/db/connection.ts` — `openDatabase()` factory. Enables
  `PRAGMA foreign_keys=ON`, loads `sqlite-vec` via
  `getLoadablePath()`, and runs the migration runner as its final step.
- `src/main/db/schema.ts` — schema-level constants (`CODE_SCHEMA_VERSION`,
  `VECTOR_DIMENSION`, `VEC_ITEMS_TABLE`, `VECTOR_METADATA_TABLE`,
  `DB_FILE_NAME`, `BACKUP_FILE_PREFIX`) and shared row shapes.
- `src/main/db/migrations/` — forward-only migration runner and files.
  - `runner.ts` — transactional, backup-first runner keyed on
    `PRAGMA user_version`. Throws `NewerSchemaVersionError` when the DB
    reports a schema newer than the code (see ADR 0003).
  - `index.ts` — sequential migration registry.
  - `0001-init.ts` — DDL for all 22 tables (20 entity tables +
    `vector_metadata` + `vec_items` virtual table).
- `src/main/db/dao/` — typed DAOs per entity (`knowledge-items`,
  `people`, `projects`, `charters`, `news-items`, `docs`, `tickets`,
  `wip-signals`, `vectors`, and the `index.ts` barrel).
- `src/main/db/fixtures/` — fixture data + `FixtureSeedRunner`
  populating a freshly-migrated DB via `pnpm seed`.

## Platform / data layer

Cross-process utilities and the on-disk footprint.

- `src/shared/paths.ts` — per-OS `AppPaths` resolver with XDG fallbacks;
  idempotent `createDirectories` (creates `index/`, `models/`,
  `team-repo/`, `attachments/`, `backups/` under `data/`); helpers
  `databaseFile`, `teamRepoDir`, `backupDir`.
- `src/shared/logger.ts` — structured JSON logger, blocklist + regex secret
  redaction, bounded rotation (5 MB × 5 files).
- `src/shared/feature-flags.ts` + `src/shared/feature-flags.schema.ts` —
  typed feature-flag config with `env > file > default(false)` precedence.
- `src/shared/i18n.ts` — `t()` stub with a fallback-key registry.
- `src/shared/result.ts` — shared `Result<T> = { success: true; data } | { success: false; error }`
  type used by the keychain adapter (and future modules).
- `src/shared/keychain.ts` — `KeychainAdapter` with `getSecret` /
  `setSecret` / `deleteSecret` backed by `@napi-rs/keyring`, falling
  back to an AES-256-GCM encrypted file (`secrets.enc`, mode 0600) when
  the OS keychain is unavailable. See ADR 0002.

## Shared types / contracts

The five stable contract placeholders. Every file opens with a
`DO NOT MODIFY EXPORTS WITHOUT A VERSIONING ADR` warning.

- `src/contracts/team-repo.contract.ts` — `TeamRepo`
- `src/contracts/local-store.contract.ts` — `LocalStoreSchema`
- `src/contracts/core-service.contract.ts` — `CoreServiceResult<T>`
- `src/contracts/ai-task.contract.ts` — `AITask`
- `src/contracts/domain-model.contract.ts` — `KnowledgeItem`
- `src/contracts/seed-runner.contract.ts` — `SeedRunner`, `SeedResult`

## Tests

Vitest suites mirroring `src/`, plus meta checks. Tests under `tests/renderer/**`
run in `jsdom`; everything else runs in Node.

- `tests/main/` — main-process wiring (index smoke test, error boundary).
- `tests/renderer/hooks/` — a11y hook tests using `window.matchMedia` mocks.
- `tests/shared/` — paths, logger, feature-flags.
- `tests/contracts/` — snapshot of exported contract symbols.
- `tests/scripts/` — seed runner stub.
- `tests/meta/` — `package.json` script contract.
- `tests/ci/` — GitHub Actions workflow structure + SHA-pin enforcement.
- `tests/packaging/` — `electron-builder.yml` shape.
- `tests/docs/` — README / HANDOFF / ADR / repo-layout content assertions.

## Build / packaging

- `electron-builder.yml` — per-OS targets: NSIS (Windows), DMG (macOS),
  AppImage (Linux). `directories.output: dist/installers`.
- `build/entitlements.mac.plist` — minimum hardened-runtime entitlements.
- `build/icon.png` — placeholder icon (replace before release).
- `scripts/notarize.js` — `afterSign` hook stub for future notarisation.

## Docs

- `docs/adr/0001-stack.md` — the stack ADR.
- `docs/adr/0002-keychain-and-encrypted-fallback.md` — keychain adapter
  and AES-256-GCM encrypted-file fallback.
- `docs/adr/0003-local-store-migrations.md` — forward-only,
  transactional, backup-first local-store migration runner.
- `docs/adr/` — one file per architectural decision. Never rewrite an
  accepted ADR; supersede it with a new one.
- `docs/architecture/repo-layout.md` — this document.
- `docs/architecture/domain-model.md` — entity shapes and status enums.
- `docs/architecture/store-schema.md` — on-disk schema of `cairn.db`.
- `docs/architecture/` — architecture notes (diagrams, data-flow, deployment).

## Scripts

Node scripts and pnpm entry points.

- `scripts/seed.ts` — pluggable seed runner (`pnpm seed`).
- `scripts/notarize.js` — `afterSign` hook (macOS).
- `scripts/verify-native-modules.ts` — better-sqlite3 + sqlite-vec smoke.
