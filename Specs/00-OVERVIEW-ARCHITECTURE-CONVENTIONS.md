# Cairn — Build Specifications
## WP-00 · Overview, Architecture & Conventions (read first)

**Phase:** Foundations · **Depends on:** none · **Hands off to:** all work packages
**This document is binding for every WP.** Read it before starting any chunk.

> **NOTE ON USING THIS SET.** Each numbered spec (`01`–`22`) is **fully self-contained**: it repeats the shared *Standing Brief* (context, constraints, privacy invariants, Definition of Done) and inlines the specific contracts it needs, so a developer given **only that one file plus the current project folder** can execute it — they do **not** receive this `00` file or any other spec. This `00` is an **orientation/index for whoever assembles the pipeline**; the redundancy across specs is intentional.

---

---

### 0.1 What we are building
Cairn is a **local-first desktop application** for a single software squad (5–15 people) that runs many short, individual PoC projects, holds daily standups, and maintains a few background apps. It gives each developer daily value on its own; team-level value (status, pulse, reports) is a by-product of aggregating what individuals already produce. There is **no central server**: the team's shared state lives as files in a **git repository**, and AI runs **locally by default** (small LLM via a local runtime), calling a hosted Claude API only selectively, under a token budget.

The product vision, features, and rationale live in `Cairn-Project-Spec.md` (the product spec). A clickable UI reference exists in `Cairn-Prototype.html` — **treat it as the visual/interaction source of truth** for screens, layout, copy tone, and the "explain mode" info bubbles. These build specs translate that vision into sequenced, implementable work packages (WPs).

### 0.2 How these specifications are meant to be used
- Work is executed by an **automated development pipeline**: a sequence of developers, each taking one WP. When a WP is complete, the **project folder is handed off** to the next developer in the order implied by the dependency graph (§0.8).
- Each developer **has their own architect** and owns the fine-grained code design. These specs therefore define **what must exist and how it must behave** (requirements, data contracts, interfaces, acceptance criteria) — **not** every class or line.
- A WP is only "done" when it meets its **Acceptance Criteria** and the **global Definition of Done** (§0.9). The handoff must leave the repo green (builds, lints, tests pass).
- If a spec conflicts with reality discovered during build, the developer records the deviation as an **ADR** (§0.9) and updates the affected spec/contract docs in the repo before handoff.

### 0.3 Technology stack — delegated, with constraints
**Stack choice (language/framework/desktop shell) is delegated to the implementing team/architects.** Whatever is chosen MUST satisfy these hard constraints:

- **Local-first & offline-capable.** All routine features work with no internet except: pulling AI news, the GitHub bootstrap, and explicit Claude calls. No required cloud backend owned by Cairn.
- **Cross-platform, Windows-first.** Must build, run, and be packaged for **Windows (primary), macOS, and Linux**. Develop and CI-test on Windows first; keep the other two working.
- **Low footprint.** Idle RAM target < 400 MB (excluding the local model runtime); cold start < 4 s to interactive shell (see §0.7).
- **Embeds/needs at runtime:** a local LLM runtime (default: **Ollama**, reachable over its local HTTP API, used for both generation and embeddings), local **speech-to-text** (default: a bundled **whisper.cpp** binary), the system **git** binary, and an **embedded datastore** (default: SQLite-class file DB + a local vector index).
- **Single, documented build** producing signed installers per OS.

A **non-binding reference stack** the architects may adopt: Electron or Tauri shell + TypeScript/React renderer; Node or Rust core services; `git` via CLI/`simple-git`; GitHub via Octokit/REST; SQLite (`better-sqlite3`/`rusqlite`) + `sqlite-vec`; Ollama HTTP for LLM + embeddings; whisper.cpp sidecar. **WP-01 must record the actual chosen stack as ADR-0001** and all later WPs follow it.

### 0.4 Stable contracts (binding regardless of stack)
These are the interop seams that keep independently-built chunks compatible. They MUST NOT be changed without an ADR + version bump:

1. **Team-repo file schema** — the on-disk format of the shared git repo (`projects/`, `updates/`, `signals/`, `decisions/`, `apps/`, `docs/`, `meetings/`, `news/`, `pulse/`, `cairn.config.yaml`). Canonical definition: **WP-04 §"Team-repo schema"**. Every field carries a `schema_version`.
2. **Local store schema** — the embedded DB tables and the on-disk data directory layout. Canonical definition: **WP-02**.
3. **Core service API (IPC/local API)** — the typed operation + event surface the UI calls. Canonical definition: **WP-03**. Adding operations is allowed; changing/removing requires an ADR.
4. **AI task contract** — the request/response/budget shape for all model work. Canonical definition: **WP-05**.
5. **Domain model** — the shared entity definitions (Project/Charter, Update, Signal, Decision, NewsItem, Doc, Meeting, Ticket, App, Person). Canonical definition: **WP-02 §Domain model**.

### 0.5 Logical architecture (responsibility map, not folders)
```
┌───────────────────────────── Desktop app (one per developer) ──────────────────────────────┐
│  UI layer (renderer)                                                                         │
│    app shell · navigation · design system · screens/features · explain-mode bubbles          │
│        │  calls Core Service API (WP-03), receives events                                    │
│  Core services (main/background)                                                             │
│    ┌ Git Sync engine (WP-04)      ┌ AI engine + router (WP-05)   ┌ Search/Knowledge index   │
│    ┌ Collectors + Scheduler (WP-06)  ┌ Setup/Bootstrap orchestrator (WP-08)  (WP-07)         │
│    ┌ Report generator (WP-16)     ┌ Meeting pipeline (WP-13)                                  │
│  Platform/data layer                                                                          │
│    embedded DB + vector index (WP-02) · secret store · file/dir paths · config · logging      │
└───────────────┬───────────────────────────────────────────────┬─────────────────────────────┘
   git (local repos + team remote)        local LLM/STT runtimes        GitHub API · RSS feeds · Claude API
```

### 0.6 Cross-cutting principles (apply to every WP)
- **Derived, not entered.** Prefer inferring state from git/activity over asking the user to type it; humans confirm/correct.
- **Local by default, Claude on purpose.** Never send data off-device except via the AI router's explicit Claude path (§WP-05) or the named read-only integrations (GitHub, RSS).
- **Privacy invariants (hard):** code is never written to `signals/`; meeting audio never leaves the device; secrets never enter the team repo; every outbound Claude call is attributable to a user action or an explicit routing rule and is metered.
- **Everything is inspectable.** Shared state is human-readable files in the team repo; the user can read them by hand.
- **Consent & reversibility.** Anything that records people (meeting listener) is opt-in per session with a visible indicator. AI-proposed changes to plans/charters are **proposed, never auto-applied**.
- **Graceful degradation.** If Ollama/whisper/network/budget is unavailable, features degrade with a clear message rather than failing hard.

### 0.7 Non-functional requirements (global budgets/targets)
- **Startup:** interactive shell < 4 s on a mid-range laptop; first meaningful data < 2 s after that (from cache).
- **Responsiveness:** any UI action acknowledges < 100 ms; long work (indexing, generation) runs in background with progress + cancel.
- **Memory:** app core < 400 MB idle (model runtime excluded).
- **Offline:** all non-network features fully usable offline; network features queue/retry.
- **Token economy:** ≥ 90% of AI calls served locally; every Claude call shows an estimate before spend and is counted against the budget; hard cap enforced.
- **Accessibility:** keyboard-navigable, visible focus, WCAG AA contrast, respects reduced-motion and OS dark/light. UI reference uses a dark theme; light theme is a later option but design tokens must allow it.
- **Internationalization-ready:** no hard-coded user strings in logic; centralize copy (English ships first).
- **Data safety:** no destructive git/file action without confirmation; all writes to the team repo go through the Git Sync engine (no ad-hoc writers).

### 0.8 Work-package index & dependency order
| WP | Title | Depends on |
|----|-------|-----------|
| 00 | Overview, Architecture & Conventions | — |
| 01 | Project scaffolding & dev environment | 00 |
| 02 | Data layer, store & domain model | 01 |
| 03 | Core service API & process/IPC architecture | 01, 02 |
| 04 | Git sync engine & team-repo schema | 02, 03 |
| 05 | AI engine & router (LLM, embeddings, Claude, budget) | 02, 03 |
| 06 | Collectors & scheduler | 03, 04, 05 |
| 07 | Search & knowledge index | 02, 05 |
| 08 | First-run setup & cold-start bootstrap | 04, 05, 06, 07 |
| 09 | UI shell, design system & widget framework | 03 |
| 10 | Feature: Today dashboard & widgets | 09, 04, 06 |
| 11 | Feature: PoC Projects, charter & guardrails | 09, 04, 05 |
| 12 | Feature: Dailies pack & WIP radar | 09, 04, 06 |
| 13 | Feature: Meeting listener | 09, 05 |
| 14 | Feature: News & Knowledge | 09, 06, 07 |
| 15 | Feature: Docs Hub | 09, 04, 07 |
| 16 | Feature: Reports & document generation | 09, 05, 04 |
| 17 | Feature: Team Pulse | 09, 04 |
| 18 | Feature: Support & Apps | 09, 04, 06 |
| 19 | Feature: Settings & AI config | 09, 02, 05 |
| 20 | Security, privacy & consent (cross-cutting) | 02, 03, 05 |
| 21 | Packaging, auto-update & observability | 01, 20 |
| 22 | Testing, QA & release | all |

Recommended execution: 01→02→03 sequentially; then 04 and 05 (can parallelize), then 06/07; 09 can start after 03 in parallel with engines; 08 after engines; features 10–19 after 09 + their engine deps; 20 woven throughout and audited before 21; 22 continuous, gated at release.

### 0.9 Global Definition of Done & conventions
**Every WP must, before handoff:**
1. Build cleanly on Windows (and not break macOS/Linux builds); installer/build script still works.
2. Pass lint, format, and static type checks (zero errors).
3. Include **automated tests** for the WP's logic (unit + integration as relevant) and leave the suite green. Coverage target for core/engine code ≥ 80% of new lines; UI gets component/interaction tests for key flows.
4. Honor all **contracts** in §0.4 and **privacy invariants** in §0.6; add tests that assert the privacy invariants where the WP touches them.
5. Update `/docs` in the repo: the affected contract docs, a short **CHANGELOG** entry, and an **ADR** (`/docs/adr/NNNN-title.md`, format: Context/Decision/Consequences) for any non-trivial or contract-affecting decision.
6. Provide/refresh **fixtures or a seed/demo dataset** so the next developer can run the app with realistic data without external setup.
7. Leave a **`HANDOFF.md`** at repo root (overwritten each WP) describing: what was added, how to run it, known gaps, and what the next WP should assume.
8. Feature flags: anything incomplete is behind a flag (default off) so the app always runs.

**Coding standards:** strict typing; no secrets in code or logs; structured logging with levels; user-facing errors are actionable; all timestamps stored UTC ISO-8601; all IDs are stable slugs or UUIDs as specified per entity.

**Testing layers (see WP-22):** unit (logic), integration (engines against a temp git repo / mock Ollama / mock GitHub / mock Claude), end-to-end (key user flows in the packaged app), and contract tests (assert the §0.4 schemas).

### 0.10 Spec template (each WP file follows this)
`Goal` · `Context & inputs` · `Scope (in/out)` · `Requirements (detailed)` · `Data contracts/interfaces` · `Acceptance criteria` · `Definition of Done (delta beyond §0.9)` · `Handoff notes` · `Risks/open questions`.

### 0.11 Glossary
**Team repo** — the shared git repo holding all squad state. **Local repos** — the dev's working code repos Cairn observes. **WIP signal** — metadata-only marker of unpushed local work. **Charter** — a PoC's goal/criteria/non-goals/deadline. **Router** — component deciding local-vs-Claude per AI task. **Collector** — background job that ingests a source. **Bootstrap** — the first-run cold-start data gather. **Explain mode** — the UI overlay of info bubbles.
