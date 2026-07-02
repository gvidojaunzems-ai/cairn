# Cairn Build Spec 04 · Git sync engine & team-repo schema

**Build order:** Engines. Assume the data layer + service-API skeleton exist (verify in the folder). You own ALL git and team-repo I/O.

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

### Local store — reference (per-machine; access only via the data-layer DAOs)
An embedded file DB (SQLite-class) + a local vector index live under the OS app-data dir (`cairn/cairn.db`, `index/`, `cache/`, `logs/`, `team-repo/`, `local.config.json`). Main entities: people, projects (+charter), updates, signals, decisions, apps, tickets, news_items, news_topics, docs, meetings, action_items, reports, feeds/sources, budget_ledger, jobs, sync_state, settings/kv, and the vector index (keyed by entity_type+entity_id+chunk). **Never** access the DB with raw queries from outside the data layer; **never** put secrets in the DB/config/logs (secrets → OS keychain). Per-machine/personal settings live in `local.config.json`; shared settings live in the team repo's `cairn.config.yaml`. Domain-model types are shared across the app; reuse them.

### Core service API (how the UI talks to the core) — reference
The **UI never touches git, the filesystem, the DB, or the network directly** — it calls a **typed operation + event API** across a process boundary (IPC or localhost, per the folder's existing choice). Long operations return a `jobId` immediately, run on a background worker, emit `job.progress {jobId,pct,label}` and `job.done {jobId,result|error}`, and are cancelable. Errors are typed (`ValidationError, NotFound, Conflict, Unavailable, Forbidden, Internal`) with a stable `code` + user-safe `message`. Events carry minimal payloads; the UI re-fetches on an event. If this API already exists in the folder, **conform to it**; otherwise define the operations this WP introduces and document them in `/docs/architecture/service-api.md`.

### AI task contract — reference (call AI ONLY through this engine)
Request: `{ taskType, inputs, qualityTier:'fast'|'polished', external:bool, maxTokens?, temperature?, context? }`. Response: `{ text|structured, model, source:'local'|'claude', tokensIn, tokensOut, estCost, cached, truncated }`. **Routing:** prefer **local** (Ollama, 0 token cost). Escalate to **Claude** only when *(a)* `qualityTier='polished'` AND `external=true`, OR *(b)* the user explicitly chose "Polished", OR *(c)* a "quality fallback" setting is on AND the local result fails a check AND budget remains. A **weekly token budget** is enforced: estimate before any Claude call; if it would exceed the cap, refuse and fall back to local; record every Claude call to a budget ledger and emit `budget.updated`. Never call Claude for local-tier/routine tasks. If the local runtime is down, return a clear `Unavailable` and degrade (don't silently use Claude). Embeddings are produced locally by this engine too.

---

## 1. Goal
Own **all interaction with git**: (a) the **canonical team-repo file schema** (stable contract ①, fully specified below), (b) pull/push sync of the team repo, (c) **read-only** observation of the developer's local code repos, and (d) writing **WIP signals**. **No other component may read or write the team repo directly** — everything goes through the write API you expose.

## 2. Context & starting state
The folder has the data layer (DAOs, domain model, `team-repo/` dir path, `sync_state`) and the core service API skeleton with the `git.*` namespace stubbed. The system `git` binary is available.

## 3. Scope
**In:** clone/pull/push; typed (de)serialization of every repo artifact; conflict handling + partitioning; a local-repo scanner; WIP signal computation + write; the `git.*` ops; reconciling repo → local DB.
**Out:** GitHub/PR data (a collectors task); the AI model call that summarizes a diff (call the AI engine already in the folder); feature UIs.

## 4. Requirements
### 4.1 CANONICAL team-repo schema (do not change without an ADR + version bump)
```
cairn-team/
  cairn.config.yaml                       # schema_version, feeds, budget policy, roles, on-call
  projects/<slug>.md                      # PoC: YAML charter frontmatter + markdown body
  updates/<YYYY-MM-DD>/<handle>.md        # per-person, per-day standup marker
  signals/<YYYY-MM-DD>/<handle>.json      # WIP metadata ONLY (never code)
  decisions/<NNNN>-<slug>.md              # ADR-lite
  apps/<slug>.md                          # background app record
  apps/tickets/<ticket-id>.md             # support ticket
  docs/<group>/<slug>.md                  # docs hub pages
  meetings/<YYYY-MM-DD>-<slug>.md         # meeting note (summary + extracted items; NO audio)
  news/<YYYY-MM-DD>-digest.md             # optional committed digest
  pulse/<YYYY>-W<WW>.md                   # weekly team digest
```
Frontmatter/shape per artifact:
- **projects/<slug>.md** — `schema_version, id, name, status[active|idle|stalled|shipped|archived|drift], owner, repo_url?, created_at, deadline?, goal, success_criteria[], non_goals[], suggested_owner?`; body = notes/links.
- **updates/.../<handle>.md** — `schema_version, date, person, approved_at`; body = `## Yesterday` / `## Today` / `## Blockers` bullet lists.
- **signals/.../<handle>.json** — `{schema_version, person, ts, project?, branch, ahead_local, ahead_pushed, files_touched[], last_active, unpushed_days, summary}`. **`summary` is a short natural-language description ONLY — raw code/diff content is forbidden (privacy invariant; add a test).**
- **decisions/<NNNN>-<slug>.md** — `schema_version, id, title, status[proposed|accepted|superseded], date, project?, tags[]`; body = Context/Decision/Consequences.
- **apps/<slug>.md** — `schema_version, id, name, owner, health, last_deploy?, oncall?` + body. **apps/tickets/<id>.md** — `schema_version, id, app, title, priority, status, opened_at, assignee?, source` + body + optional `## Resolution`.
- **docs/.../*.md** — `schema_version, title, group, source[manual|repo-import|ai-draft], status[ok|stale|draft], owner?, updated_at, tags[]` + body.
- **meetings/*.md** — `schema_version, date, title, attendees[]` + `## Summary` / `## Decisions` / `## Action items` (each item has an owner). No audio ever.
- **pulse/*.md** — small frontmatter (`week, generated_at`) + digest body.
Provide a typed serializer/parser per artifact with a **round-trip test** (parse→write→parse is stable). All timestamps UTC ISO-8601. Publish this as `/docs/architecture/team-repo-schema.md`.
### 4.2 Clone / pull / push
Clone the configured remote into `team-repo/` if absent, else `pull` (prefer fast-forward) on launch, on schedule, and on demand (`git.pull`). Writes use small **structured commits** (message: `cairn: <area> <action> (<handle>)`) then `push` on approve-actions/schedule; batch related writes into one commit. Expose a **write API** (`writeUpdate, writeSignal, upsertProject, writeDecision, writeDoc, writeMeeting, writeTicket, upsertApp, writePulse`) — the ONLY way anything mutates the team repo. After a pull, reconcile changed files into the DB and emit `sync.updated`.
### 4.3 Conflict handling & partitioning
Per-person/per-day files (`updates/`, `signals/`) are never co-edited → conflict-free. Single-owner files (`projects/`, `apps/`): owner edits apply directly; a non-owner's edit goes into a `## Suggestions` block (never overwrite). On a real git conflict: never auto-clobber — set `sync_state` conflicted, surface a `Conflict` error + a plain-language resolution hook, offer an **AI-assisted merge** suggestion (via the AI engine) the user accepts/edits, and keep backups of both sides.
### 4.4 Local-repo scanner (READ-ONLY — never modify local repos)
Watch a configurable set of local repo paths (from local.config). Provide: recent commits per author since a timestamp, current branch, ahead/behind vs upstream, working-tree status (counts + paths), branch list with last activity. **Derive PoC status** from activity: active(<3d)/idle(3–7d)/stalled(>7d,open)/shipped(merged or tagged) — a human override always wins.
### 4.5 WIP signal emitter
On cadence (default 30 min while active) and on commit, compute per watched repo: branch, `ahead_local` vs `ahead_pushed`, files touched, last active, `unpushed_days`. Generate a **short diff summary via the AI engine (local model, text only)**, write `signals/<date>/<handle>.json`, and push a metadata-only commit. Respect the settings "emit signals on/off" and "share code = off" (the latter is a locked invariant). **Privacy test (required): assert the emitted JSON never contains file contents or diff hunks.**

## 5. Acceptance criteria
- Against a temp git remote: clone, write every artifact type, commit, push, pull into a second clone, and re-parse — all round-trip losslessly.
- Status derivation matches fixture activity; a human override persists.
- A non-owner edit to a project lands in `## Suggestions`, not an overwrite; an induced conflict is surfaced (not clobbered) with backups retained.
- A WIP signal reflects a fixture repo's unpushed branch and contains **no code** (test).
- An architectural test confirms every team-repo write in the codebase goes through this engine.

## 6. Handoff notes
A collectors task will schedule pull/scan/emit; features read derived data from the DB and request team-repo writes via your write API. Publish the schema doc so others conform.

## 7. Risks / open questions
Large repos: cache scans via `sync_state` watermarks. Private-remote auth uses tokens from the OS keychain (data layer) — never store creds in the repo.
