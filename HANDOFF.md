# Cairn — HANDOFF

## Branch: `feature/full-implementation`

Full Spec 03–20 implementation: IPC v2 catalog, engines, collectors, all 11 feature screens, security tests, architecture docs.

## How to run

```bash
git checkout feature/full-implementation
fnm use 20              # or nvm use — Node 20 LTS required
pnpm install
pnpm setup:env          # Ollama + git team-repo + seed + local config
pnpm dev                # full product UI
pnpm build
pnpm test
pnpm typecheck
```

**Local LLM (Ollama):** Install from https://ollama.com, then:
```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```
Cairn uses `http://127.0.0.1:11434` by default. Template fallback applies when Ollama is offline.

**Toolchain:** Node >= 20, pnpm >= 9, git, VS C++ build tools (Windows) for `better-sqlite3` / `sqlite-vec`.

## What was implemented

### Spec 03 — Core Service API (apiVersion **2.0.0**, ADR 0007)

- **70 IPC operations** across 16 namespaces (see `docs/architecture/service-api.md`)
- **10 events:** `sync.updated`, `job.progress`, `job.done`, `signals.updated`, `news.updated`, `budget.updated`, `meeting.partial`, `meeting.proposals`, `setup.progress`, `toast`

### Spec 04 — Git sync & team-repo

- `src/main/engines/team-repo-engine.ts` — artifact parsers/writers, write API, pull/push, WIP privacy validation
- `docs/architecture/team-repo-schema.md`

### Spec 05 — AI engine

- `src/main/engines/ai-engine.ts` — Ollama + template fallbacks, budget ledger, taskType registry, Claude path (keychain-gated)
- `docs/architecture/ai-contract.md`

### Spec 06 — Collectors

- `src/main/collectors/` — scheduler + team-sync, wip-signals, news collectors
- `docs/architecture/collectors.md`

### Spec 07 — Search

- `src/main/engines/search-engine.ts` — hybrid query + `askDocs` RAG
- `docs/architecture/search.md`

### Spec 08 — Setup bootstrap

- `src/main/engines/setup-orchestrator.ts` — 8-step wizard backend
- `docs/architecture/setup.md`

### Spec 09 — UI shell

- Design system, widget registry, explain popovers, toast service, event refetch hook
- `docs/ui/components.md`

### Specs 10–19 — Feature screens

All 11 screens with Spec 03 IPC ops: Today (widgets + customize), Projects (detail + charter + onboarding), Dailies, Meetings (consent + STT + proposals), News, Docs (tree + ask), Reports, Pulse, Support, Settings, Setup wizard.

### Spec 20 — Security

- `tests/security/privacy-invariants.test.ts`
- `docs/security/threat-model.md`

### Spec 21–22 — Packaging & QA

- electron-builder config retained; signing/whisper bundle documented as deployment follow-up
- Contract tests updated for IPC v2; DB tests skip gracefully when native bindings unavailable (Node 24 dev machines)

## Key paths

| Area | Path |
|------|------|
| IPC contracts | `src/shared/ipc/` |
| Services | `src/main/services/` |
| Engines | `src/main/engines/` |
| Collectors | `src/main/collectors/` |
| DB | `src/main/db/` |
| UI | `src/renderer/` |
| Specs | `Specs/` |
| ADRs | `docs/adr/` |

## External runtime (optional)

- **Ollama** — local AI (`http://127.0.0.1:11434`); degrades to templates if offline
- **Git** — team-repo sync when `git` binary available
- **Claude API** — via keychain secret; disabled without key
- **whisper.cpp** — meeting STT uses simulated transcript until binary bundled (Spec 21)

## CI

GitHub Actions configured; CI is dormant until you push this branch to GitHub. Use **Node 20** in CI for native modules.

## Known deployment gaps (Spec 21)

- Code signing / notarization not configured
- whisper.cpp binary not bundled
- Auto-update channel not wired

These require release infrastructure beyond application logic.
