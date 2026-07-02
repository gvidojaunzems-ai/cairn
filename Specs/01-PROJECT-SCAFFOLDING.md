# Cairn Build Spec 01 · Project scaffolding & dev environment

**Build order:** Foundations (first task). Assume an empty folder.

> ## STANDING BRIEF — read fully. **This spec is self-contained.**
> You are implementing **one work package** for **Cairn**. The ONLY inputs you have are **(1) this file** and **(2) the current project folder** (code + any committed docs). There is no separate overview document and no memory of earlier tasks. Everything you need is in this file or discoverable in the code. **Before coding, inspect the project folder** to see what earlier tasks built, and conform to the existing tech stack, patterns, and contracts already present; if something described here already exists in code, integrate with it instead of duplicating.
>
> **What Cairn is.** A **local-first desktop app** for a 5–15-person dev squad that runs monthly PoC projects, holds daily standups, and maintains a few background apps. It gives each developer daily value on its own; team value is a by-product of aggregating what individuals produce. **There is no central server** — the squad's shared state lives as files in a **git repository ("the team repo")**. AI runs **locally by default** (a small LLM via a local runtime) and calls a hosted **Claude API** only selectively, under a token budget. If present in the folder, `Cairn-Project-Spec.md` is the product vision and `Cairn-Prototype.html` is the **UI/interaction source of truth** (match its layout, structure, and copy tone).
>
> **Hard constraints (all work):**
> - **Local-first & offline-capable** — everything works offline except pulling AI news, the GitHub import, and explicit Claude calls. No Cairn-owned cloud backend.
> - **Windows-first, cross-platform** — must build/run/package on **Windows (primary)**, macOS, and Linux. Develop and test on Windows first; keep the others working.
> - **Low footprint** — core idle RAM < 400 MB (excluding the model runtime); cold start < 4 s to interactive; UI actions acknowledge < 100 ms; long work runs in the background with progress + cancel.
> - **Stack is the implementer's choice** *within these constraints* and **must match whatever the project folder already uses** (the first task recorded it as an ADR — check `/docs/adr`). Required runtime pieces: a local LLM runtime (**default Ollama**, used for generation **and** embeddings), local **speech-to-text** (**default: a bundled whisper.cpp binary**), the system **git**, and an **embedded datastore** (SQLite-class file DB + a local vector index).
> - **Accessibility & i18n-ready** — keyboard-navigable, visible focus, WCAG AA contrast, honor reduced-motion and OS dark/light; no hard-coded user strings in logic; timestamps stored UTC ISO-8601.
>
> **Cross-cutting principles:** *Derived, not entered* (infer state from git/activity; humans confirm). *Local by default, Claude on purpose* (never send data off-device except via the AI router's explicit Claude path or the named read-only integrations — GitHub, RSS). *Everything inspectable* (shared state is human-readable files). *Consent & reversibility* (recording people is opt-in per session with a visible indicator; AI-proposed changes to plans/charters are **proposed, never auto-applied**). *Graceful degradation* (if a runtime/network/budget is unavailable, degrade with a clear message; never silently reroute local tasks to Claude).
>
> **PRIVACY INVARIANTS (hard — add tests wherever your WP touches them):** (1) **No code in WIP signals** — the metadata-only markers of unpushed work carry only a short natural-language summary, never file contents/diffs. (2) **Meeting audio stays on-device** and is discarded after transcription; never uploaded or persisted beyond a transient buffer. (3) **Secrets** (API keys/tokens) live only in the **OS keychain** — never in the DB, config files, the team repo, or logs (redact logs). (4) **Claude only on an explicit action or a routing rule, always metered**; no Claude call for routine/local-tier tasks. (5) **The team repo holds no secrets.**
>
> **Five stable contracts (never break; version any change with an ADR):** ① Team-repo file schema · ② Local store schema (embedded DB + data dir) · ③ Core service API (typed op + event surface the UI calls) · ④ AI task contract · ⑤ Domain model (shared entity types). *This spec inlines the parts it needs below; for anything else, conform to what already exists in the project folder.*
>
> **DEFINITION OF DONE (every task):** builds clean on Windows (don't break macOS/Linux); lint + format + strict types pass; **automated tests** for your logic (unit + integration; core/engine ≥ 80% new-line coverage; key UI flows covered) and the suite is green; honor the privacy invariants with tests where touched; update `/docs` (affected contract docs + a `CHANGELOG` entry + an **ADR** at `/docs/adr/NNNN-*.md` for any non-trivial or contract-affecting decision); provide/refresh **fixtures/seed data** so the next task can run with realistic data; leave/overwrite a root **`HANDOFF.md`** (what you added, how to run it, known gaps, what the next task should assume); keep anything incomplete behind a **feature flag** (default off) so the app always runs. Structured logging; never log secrets.
>
> **Glossary:** *Team repo* = shared git repo of squad state · *Local repos* = the dev's own code repos Cairn observes **read-only** · *WIP signal* = metadata-only marker of unpushed local work · *Charter* = a PoC's goal/success-criteria/non-goals/deadline · *Router* = decides local-vs-Claude per AI task · *Collector* = background ingest job · *Bootstrap* = first-run cold-start data gather · *Explain mode* = the UI overlay of info bubbles.

---

## 1. Goal
Stand up the repository, the chosen tech stack, developer tooling, CI, and a packaging skeleton so that a "run" command opens an **empty Cairn application window** on Windows/macOS/Linux and a "package" command produces an installer. This makes every later task buildable and testable.

## 2. Context & starting state
The project folder is empty or near-empty. You are the first task; nothing else exists yet.

## 3. Scope
**In:** stack selection + ADR; repo layout; dependency management; run/build/test/lint/format/typecheck/seed scripts; hot-reload dev loop; logging + global error boundary; per-OS data/config path resolution; a feature-flag mechanism; CI; packaging skeleton; `HANDOFF.md`.
**Out:** any real feature; the data schema; the service API; the UI design system (all later tasks).

## 4. Requirements
1. **Choose the stack** honoring the Standing Brief constraints (local-first; Windows-first cross-platform; low footprint; must integrate git, a local LLM runtime (Ollama), whisper.cpp, and an embedded SQLite-class DB + vector index). Record the choice, rationale, and rejected alternatives as **`/docs/adr/0001-stack.md`**. Every later task will read this ADR and follow it.
2. **Repo layout** documented in `/docs/architecture/repo-layout.md`, with a clear separation of *UI layer*, *core services*, *platform/data layer*, *shared types/contracts*, *tests*, *build/packaging*, and `/docs` (including `/docs/adr`).
3. **Scripts** (one documented command each) in the root `README.md`: `dev` (run w/ hot reload), `build`, `package` (per-OS installer), `test`, `lint`, `format`, `typecheck`, `seed` (load fixtures — stub for now with a defined interface).
4. **Quality gates** wired and green on the empty project: linter, formatter, strict type-checking, test runner.
5. **Logging & errors:** a structured logger (levels; rotating file in the data dir + console in dev) and a global error boundary that shows a friendly screen and writes a log. **Never logs secrets.**
6. **Paths & config:** a single `paths` utility resolving per-OS app-data/cache/logs dirs (Windows `%APPDATA%`; macOS `~/Library/Application Support`; Linux `$XDG_*`), created on first run.
7. **Feature flags:** a simple flags module (config file + env override) so incomplete work ships disabled by default and the app always runs.
8. **CI:** run lint+typecheck+test+build on **Windows (required)** and at least one of macOS/Linux; cache deps; fail on any gate.
9. **Packaging skeleton:** `package` yields a launchable installer per OS opening a blank window titled "Cairn". Leave hooks for signing/auto-update (done in a later hardening task).

## 5. Acceptance criteria
- `dev` opens a blank Cairn window on Windows, macOS, and Linux.
- All quality-gate scripts exist and pass on the empty project; CI is green.
- `package` produces a launchable installer on Windows (script parametrized for the other OSes).
- Data/logs dirs are created on first run in the correct per-OS locations; no secrets in logs.
- `README.md` documents every script; `/docs/adr/0001-stack.md` and `/docs/architecture/repo-layout.md` exist; `HANDOFF.md` explains run/build/test and where things live.

## 6. Handoff notes
Later tasks receive a runnable shell, a place for code per the layout, working test/lint/build, and the `paths`/flags/logger utilities. Record the stack in the ADR so they follow it.

## 7. Risks / open questions
Keep the dependency surface small to protect the footprint budget. Signing certificates are handled in the packaging/hardening task later — just leave hooks.
