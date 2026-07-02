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

- `src/main/index.ts` — bootstrap. Registers the error boundary, creates
  data/cache/logs directories, wires IPC channels, then constructs the
  `BrowserWindow` with `contextIsolation: true` + `sandbox: true`.
- `src/main/error-boundary.ts` — process-level `uncaughtException` and
  `unhandledRejection` handlers that funnel through the shared logger.
- `src/preload/index.ts` — the ONLY IPC bridge. Exposes a typed
  `window.cairn` surface via `contextBridge.exposeInMainWorld`.

## Platform / data layer

Cross-process utilities and the on-disk footprint.

- `src/shared/paths.ts` — per-OS `AppPaths` resolver with XDG fallbacks;
  idempotent `createDirectories`.
- `src/shared/logger.ts` — structured JSON logger, blocklist + regex secret
  redaction, bounded rotation (5 MB × 5 files).
- `src/shared/feature-flags.ts` + `src/shared/feature-flags.schema.ts` —
  typed feature-flag config with `env > file > default(false)` precedence.
- `src/shared/i18n.ts` — `t()` stub with a fallback-key registry.
- `src/shared/keychain.ts` — Result-shape stub; real adapter is
  `@napi-rs/keyring` per ADR 0001.

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

- `docs/adr/0001-stack.md` — this stack ADR.
- `docs/adr/` — one file per architectural decision. Never rewrite an
  accepted ADR; supersede it with a new one.
- `docs/architecture/repo-layout.md` — this document.
- `docs/architecture/` — architecture notes (diagrams, data-flow, deployment).

## Scripts

Node scripts and pnpm entry points.

- `scripts/seed.ts` — pluggable seed runner (`pnpm seed`).
- `scripts/notarize.js` — `afterSign` hook (macOS).
- `scripts/verify-native-modules.ts` — better-sqlite3 + sqlite-vec smoke.
