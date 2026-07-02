# Cairn Build Spec 07 · Search & knowledge index

**Build order:** Engines. Assume the data layer + AI engine (local embeddings) exist (verify in the folder).

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

### AI task contract — reference (call AI ONLY through this engine)
Request: `{ taskType, inputs, qualityTier:'fast'|'polished', external:bool, maxTokens?, temperature?, context? }`. Response: `{ text|structured, model, source:'local'|'claude', tokensIn, tokensOut, estCost, cached, truncated }`. **Routing:** prefer **local** (Ollama, 0 token cost). Escalate to **Claude** only when *(a)* `qualityTier='polished'` AND `external=true`, OR *(b)* the user explicitly chose "Polished", OR *(c)* a "quality fallback" setting is on AND the local result fails a check AND budget remains. A **weekly token budget** is enforced: estimate before any Claude call; if it would exceed the cap, refuse and fall back to local; record every Claude call to a budget ledger and emit `budget.updated`. Never call Claude for local-tier/routine tasks. If the local runtime is down, return a clear `Unavailable` and degrade (don't silently use Claude). Embeddings are produced locally by this engine too.

### Local store — reference (per-machine; access only via the data-layer DAOs)
An embedded file DB (SQLite-class) + a local vector index live under the OS app-data dir (`cairn/cairn.db`, `index/`, `cache/`, `logs/`, `team-repo/`, `local.config.json`). Main entities: people, projects (+charter), updates, signals, decisions, apps, tickets, news_items, news_topics, docs, meetings, action_items, reports, feeds/sources, budget_ledger, jobs, sync_state, settings/kv, and the vector index (keyed by entity_type+entity_id+chunk). **Never** access the DB with raw queries from outside the data layer; **never** put secrets in the DB/config/logs (secrets → OS keychain). Per-machine/personal settings live in `local.config.json`; shared settings live in the team repo's `cairn.config.yaml`. Domain-model types are shared across the app; reuse them.

---

## 1. Goal
Build and maintain a **local semantic + keyword index** over the team's knowledge (docs, decisions, news, project charters/notes, meeting notes) and expose **search** and **grounded "Ask the docs"/knowledge Q&A** — all on-device, zero token cost.

## 2. Context & starting state
The folder has the data layer (DAOs + a vector index store) and the **AI engine** (local embeddings + local generation). Use those; do not call any cloud service.

## 3. Scope
**In:** chunking + embedding pipeline; incremental index updates; a full `rebuildAll` (used by the setup task); the hybrid search API; RAG answers with citations. **Out:** producing source content (owned by docs/news/etc.); the UI.

## 4. Requirements
### 4.1 Indexable entities & chunking
Index `docs, decisions, news_items, projects (charter+notes), meetings (summaries/decisions/action items)`. Chunk by heading/paragraph with overlap; key each `(entity_type, entity_id, chunk_id)`; store the snippet + metadata (title, group, project, date, source) with the vector. Embed via the AI engine's embeddings; record an index version + a per-entity content hash to detect changes.
### 4.2 Incremental updates
On entity create/update/delete (signaled by collectors/features), re-embed only changed chunks and delete vectors for removed entities; run on the worker, debounced; keep the index consistent with the DB.
### 4.3 Full build
Provide a `rebuildAll` job with progress events; resumable/idempotent (the setup task calls it).
### 4.4 Search (`search.query`)
**Hybrid** keyword + vector; merge/rank; filters (entity type, project, date, source) + `topK`. Return results with title, snippet (highlighted on keyword), entity ref, score, source group. Target < ~300 ms on a typical index.
### 4.5 Ask-the-docs / knowledge Q&A (`search.askDocs`)
RAG: retrieve top-k relevant chunks (optionally docs-only or all knowledge), compose a grounded answer via the AI engine (local, `doc.qa`), return `{ answer, citations[] }` where each citation references the source entity so the UI can deep-link. If nothing relevant is found, say so — never fabricate. 0 token spend (local).
### 4.6 Quality & safety
Answers must cite real sources; retrieval + generation stay fully local; handle empty/garbage queries gracefully.

## 5. Acceptance criteria
- After indexing fixtures, semantic queries return relevant entities ranked sensibly; keyword filters work; latency within target.
- Editing a doc updates only its chunks; deleting removes its vectors (test).
- `askDocs("how do we deploy billing-service?")` returns a grounded answer citing the billing runbook + on-call doc (per fixtures) with valid deep-link refs and 0 token spend.
- An irrelevant question returns an honest "no relevant docs" answer.
- `/docs/architecture/search.md` documents the result/citation shapes + ops.

## 6. Handoff notes
The News/Knowledge and Docs-Hub features build UIs on `search.query`/`search.askDocs`; the setup task calls `rebuildAll` during bootstrap.

## 7. Risks / open questions
Embedding model choice affects quality/speed (use the AI engine's default). Keep the index portable/local; batch/stream big rebuilds to cap memory.
