# Cairn Build Spec 03 · Core service API & process/IPC architecture

**Build order:** Foundations. Assume scaffolding + data layer are done (verify in the folder). You build over the DAOs.

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

### Core service API (how the UI talks to the core) — reference
The **UI never touches git, the filesystem, the DB, or the network directly** — it calls a **typed operation + event API** across a process boundary (IPC or localhost, per the folder's existing choice). Long operations return a `jobId` immediately, run on a background worker, emit `job.progress {jobId,pct,label}` and `job.done {jobId,result|error}`, and are cancelable. Errors are typed (`ValidationError, NotFound, Conflict, Unavailable, Forbidden, Internal`) with a stable `code` + user-safe `message`. Events carry minimal payloads; the UI re-fetches on an event. If this API already exists in the folder, **conform to it**; otherwise define the operations this WP introduces and document them in `/docs/architecture/service-api.md`.

### Local store — reference (per-machine; access only via the data-layer DAOs)
An embedded file DB (SQLite-class) + a local vector index live under the OS app-data dir (`cairn/cairn.db`, `index/`, `cache/`, `logs/`, `team-repo/`, `local.config.json`). Main entities: people, projects (+charter), updates, signals, decisions, apps, tickets, news_items, news_topics, docs, meetings, action_items, reports, feeds/sources, budget_ledger, jobs, sync_state, settings/kv, and the vector index (keyed by entity_type+entity_id+chunk). **Never** access the DB with raw queries from outside the data layer; **never** put secrets in the DB/config/logs (secrets → OS keychain). Per-machine/personal settings live in `local.config.json`; shared settings live in the team repo's `cairn.config.yaml`. Domain-model types are shared across the app; reuse them.

---

## 1. Goal
Define and implement the **boundary between the UI and the core services**: the process/threading model, the typed **operation surface** the UI calls, the **event** stream, the error model, progress/cancellation for long work, and input validation. This is the **canonical Core Service API** (stable contract ③).

## 2. Context & starting state
The folder has the runnable shell, the datastore/DAOs/domain model, and the stack ADR. Build over the DAOs; never let the UI touch platform APIs directly.

## 3. Scope
**In:** process model; typed request/response transport (IPC or localhost — pick per the stack ADR and record it); the operation namespaces + signatures below; an event bus + event catalog; the job/progress/cancel model; the error taxonomy; input validation; versioning; a tiny end-to-end sample (one op + one event) as an integration-test fixture.
**Out:** the business logic inside each namespace (owned by later engine/feature tasks). Here you define **contracts + a working skeleton with stubs** that return `NotImplemented` where logic comes later.

## 4. Requirements
### 4.1 Process/threading
A **UI layer** that never touches git/fs/DB/network directly; a **core** hosting services; a **background worker** for long/CPU work (indexing, generation, transcription, bootstrap) so the UI stays responsive. All DB access via the DAOs; serialize writes.
### 4.2 Transport
Typed, versioned (`apiVersion`), request/response with correlation IDs, plus a server→UI event channel. Validate every request against a schema; reject invalid input with a typed error (never crash core).
### 4.3 Operation namespaces (define signatures now: name → input → output → errors)
`system.*`(getStatus,getFlags,getPaths,openExternal) · `setup.*`(getState,run,cancel) · `git.*`(getSyncState,pull,push,listLocalRepos,addLocalRepo) · `projects.*`(list,get,create(fromDescription),updateCharter,setStatus,archive,generateRetro) · `today.*`(getDashboard,getContextResume,getStandupDraft,approveStandup,regenerateStandup) · `dailies.*`(getPack,getWipRadar,listActionItems,setActionItem,nudgeUnpushed) · `news.*`(listFeed,getItem,save,listKnowledge) · `search.*`(query,askDocs) · `docs.*`(tree,get,create,save,syncRepos,listDrafts) · `meetings.*`(start,stop,getLive,getProposals,applyProposal,applyAll,get) · `reports.*`(templates,generate,export,pushToRepo) · `pulse.*`(get,generateWeeklyDigest) · `support.*`(listApps,getApp,listTickets,triageTicket,resolveTicket) · `settings.*`(get,set,testConnector,getBudget) · `ai.*`(complete,estimate,listModels,getBudget). Adding ops later is fine; **changing/removing** one requires an ADR + `apiVersion` bump.
### 4.4 Events (server → UI)
`sync.updated` · `job.progress{jobId,pct,label}` · `job.done{jobId,result|error}` · `signals.updated` · `news.updated` · `budget.updated{used,cap}` · `meeting.partial{text}` · `meeting.proposals{items}` · `setup.progress` · `toast{level,msg}`. Payloads are minimal; the UI re-fetches via ops on an event.
### 4.5 Jobs, progress, cancellation
Long ops return a `jobId`, run in the worker, emit `job.progress`, and are cancelable. Persist jobs to the `jobs` table so the UI recovers state after a reload. Failures emit `job.done` with a typed error and a logged cause.
### 4.6 Error taxonomy
`ValidationError, NotFound, Conflict, Unavailable, Forbidden, Internal` — each with a stable `code`, a user-safe `message`, optional `details`. Ops that would exfiltrate data (see the Standing Brief privacy invariants) must refuse with `Forbidden` unless on an allowed path.
### 4.7 Security at the boundary
Treat the UI as untrusted: validate/normalize all inputs; no op accepts raw fs paths / SQL / git commands beyond whitelisted validated forms; rate-limit/queue expensive ops.

## 5. Acceptance criteria
- A sample op (`system.getStatus`) and a sample long job (emits `job.progress` then `job.done`, cancelable) round-trip UI↔core.
- Invalid input yields a `ValidationError` without crashing core.
- Contract tests assert every declared op/event exists with the declared shape (stubs may return `NotImplemented`).
- An architectural test/lint rule proves the UI has no direct fs/git/DB/network access.
- `/docs/architecture/service-api.md` is generated/published with the full catalog + `apiVersion`.

## 6. Handoff notes
Engine/feature tasks implement their namespaces behind these signatures; the UI task builds a typed client against them with mocks. Keep payloads small (event-then-refetch).

## 7. Risks / open questions
Record IPC-vs-localhost in an ADR (it affects packaging later). Prefer events + refetch over pushing large datasets.
