# ADR 0001 — Cairn tech-stack decision

- **Status**: Accepted
- **Date**: 2026-07-01
- **Deciders**: Cairn foundation task
- **Consulted**: `.aide-spec/spec-package.json`, `.claude/rules/general/security-practices.md`

## Context

Cairn is a local-first, cross-platform desktop application (Windows primary,
macOS + Linux buildable) that must integrate git (read-only), Ollama,
whisper.cpp, and an embedded SQLite-class DB with vector search. The
foundation must ship with quality gates, dormant CI, and a packaging skeleton
so every later task builds on a known-good base.

## Decision

The following stack is locked. Version numbers are pinned in `package.json`
and must be re-verified before any bump.

| Concern | Choice | Why (short) |
|---------|--------|-------------|
| Desktop runtime | **Electron** | Mature, cross-OS, first-class native-module rebuild story. |
| Language | **TypeScript** (strict) | Ships types across three tsconfigs; catches contract drift at compile time. |
| Scaffold / dev server | **electron-vite** | Composes cleanly with electron-builder (Forge would compete), exposes main/preload/renderer entries with strict TS out of the box, works with pnpm. |
| Renderer bundler | **Vite** | Fast HMR, shares config with Vitest. |
| Test runner | **Vitest** | Shares Vite config, strong TS/ESM story, `jsdom` for renderer hook tests. |
| Linter | **ESLint** (v8 legacy) | `.eslintrc.cjs` layout matches the `@typescript-eslint/strict` plugin surface. |
| Formatter | **Prettier** | `tabWidth 2 / singleQuote true / semi true` per code standards. |
| Installer | **electron-builder** | Named in the spec; supports NSIS/DMG/AppImage with the same YAML. |
| Embedded DB | **better-sqlite3** | Synchronous SQLite binding with mature Electron support; supports `db.loadExtension()` for sqlite-vec. |
| Vector index | **sqlite-vec** | Runs inside SQLite as a loadable extension — lowest footprint, no extra runtime. |
| Package manager | **pnpm** (9+) | Disk-footprint and workspace ergonomics; strict hoisting catches phantom deps. |
| CI | **GitHub Actions** (dormant) | Config written now; activates on first push. Every action SHA-pinned per security-practices. |
| Native rebuild | **@electron/rebuild** | Postinstall hook wires better-sqlite3 to the current Electron ABI. |
| Keychain adapter (**intended**) | **@napi-rs/keyring** | Prebuilt N-API binaries (no rebuild step), cross-OS reach: Windows Credential Manager, macOS Keychain, Linux Secret Service. |

## Rationale

- **Local-first**: everything but AI news pull / GitHub import / Claude calls
  must work offline. An embedded SQLite plus loadable-extension vector store
  keeps the entire runtime in one process.
- **Windows-primary**: better-sqlite3 rebuilds cleanly against Electron on
  Windows given MSVC Build Tools; @napi-rs/keyring has prebuilt Windows
  binaries.
- **Contract stability**: strict TypeScript across three tsconfigs makes the
  five stable contract files under `src/contracts/` enforceable — mutations
  surface at compile time in every consumer.
- **Security posture**: preload uses `contextIsolation: true` and
  `sandbox: true` — the renderer never sees `ipcRenderer` directly. Secrets
  are read only from the OS keychain via the adapter; env vars and config
  files are off-limits. Logs are structured JSON with mandatory redaction on
  key names, message regexes, and nested contexts.

## Rejected alternatives

- **Tauri** — Rust toolchain adds friction for whisper.cpp bundling on
  Windows and shifts the primary language away from TypeScript. Also,
  fewer battle-tested native-module examples for SQLite-class embedded DBs.
- **Neutralino** — Immature ecosystem; poor native-module rebuild story.
- **Hand-rolled `vite` + `electron`** — Works, but recreates what
  `electron-vite` provides (main/preload/renderer entry separation with
  strict TS). Time better spent on features.
- **Electron Forge (@electron-forge/plugin-vite)** — Locks packaging into
  Forge's pipeline; the spec explicitly requires electron-builder.
- **keytar** for keychain — Archived / unmaintained upstream. Supply-chain
  risk outweighs familiarity. Superseded by **@napi-rs/keyring**.
- **ts-node** for scripts — Known ESM friction with strict TS + Vitest
  configs. Replaced by **tsx**, which has none of the same friction.
- **npm / yarn** — pnpm's workspace + hoisting model is a better fit and
  keeps the disk footprint low.
- **sqlite-vss / lancedb / usearch** for vector search — Adds a second
  process or a second on-disk index. `sqlite-vec` stays inside SQLite and
  matches the low-footprint budget.

## Consequences

- Postinstall runs `@electron/rebuild`; first-time `pnpm install` requires
  the platform native toolchain to be present.
- CI must run on Windows first (spec-required) and at least one of macOS /
  Linux. Every action `uses:` line is a full 40-char SHA — updates need a
  re-verification pass.
- Every renderer string routes through `t()` in `src/shared/i18n.ts` so a
  real i18n backend can drop in later without touching call sites.
- The five contract files in `src/contracts/` must never be broken without a
  successor ADR (versioning strategy in the ADR body).
- Code-signing and notarisation are deferred to a hardening task — the hooks
  in `electron-builder.yml` and `scripts/notarize.js` are placeholders.

## Follow-ups

- Replace the keychain stub with **@napi-rs/keyring**.
- Configure code-signing (`CSC_LINK`, `CSC_KEY_PASSWORD`), notarisation
  (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`), and an auto-update publish
  channel.
- Wire the sqlite-vec smoke test into a dedicated CI job so the primary
  gate stays fast.
