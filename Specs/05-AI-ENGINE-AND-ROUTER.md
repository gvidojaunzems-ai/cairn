# Cairn Build Spec 05 · AI engine & router (LLM, embeddings, Claude, budget)

**Build order:** Engines. Assume the data layer + service-API skeleton exist (verify in the folder). You own ALL model access.

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

### AI task contract — reference (call AI ONLY through this engine)
Request: `{ taskType, inputs, qualityTier:'fast'|'polished', external:bool, maxTokens?, temperature?, context? }`. Response: `{ text|structured, model, source:'local'|'claude', tokensIn, tokensOut, estCost, cached, truncated }`. **Routing:** prefer **local** (Ollama, 0 token cost). Escalate to **Claude** only when *(a)* `qualityTier='polished'` AND `external=true`, OR *(b)* the user explicitly chose "Polished", OR *(c)* a "quality fallback" setting is on AND the local result fails a check AND budget remains. A **weekly token budget** is enforced: estimate before any Claude call; if it would exceed the cap, refuse and fall back to local; record every Claude call to a budget ledger and emit `budget.updated`. Never call Claude for local-tier/routine tasks. If the local runtime is down, return a clear `Unavailable` and degrade (don't silently use Claude). Embeddings are produced locally by this engine too.

### Core service API (how the UI talks to the core) — reference
The **UI never touches git, the filesystem, the DB, or the network directly** — it calls a **typed operation + event API** across a process boundary (IPC or localhost, per the folder's existing choice). Long operations return a `jobId` immediately, run on a background worker, emit `job.progress {jobId,pct,label}` and `job.done {jobId,result|error}`, and are cancelable. Errors are typed (`ValidationError, NotFound, Conflict, Unavailable, Forbidden, Internal`) with a stable `code` + user-safe `message`. Events carry minimal payloads; the UI re-fetches on an event. If this API already exists in the folder, **conform to it**; otherwise define the operations this WP introduces and document them in `/docs/architecture/service-api.md`.

### Local store — reference (per-machine; access only via the data-layer DAOs)
An embedded file DB (SQLite-class) + a local vector index live under the OS app-data dir (`cairn/cairn.db`, `index/`, `cache/`, `logs/`, `team-repo/`, `local.config.json`). Main entities: people, projects (+charter), updates, signals, decisions, apps, tickets, news_items, news_topics, docs, meetings, action_items, reports, feeds/sources, budget_ledger, jobs, sync_state, settings/kv, and the vector index (keyed by entity_type+entity_id+chunk). **Never** access the DB with raw queries from outside the data layer; **never** put secrets in the DB/config/logs (secrets → OS keychain). Per-machine/personal settings live in `local.config.json`; shared settings live in the team repo's `cairn.config.yaml`. Domain-model types are shared across the app; reuse them.

---

## 1. Goal
Provide the **single way every component does AI**: a **local LLM + embeddings** path (default Ollama), a **routed Claude** path under a **token budget**, a versioned **prompt/runner** layer, and result **caching**. This is the **canonical AI task contract** (stable contract ④, restated in the reference block above and expanded below).

## 2. Context & starting state
The folder has the data layer (incl. `budget_ledger`, `cache`) and the service-API skeleton with the `ai.*` namespace stubbed. The Claude key (if any) lives in the OS keychain via the secret store.

## 3. Scope
**In:** local runtime integration (generate/chat/embeddings); model management + hardware-aware selection; the task contract + `taskType` registry; the router + budget enforcement; the Claude client; prompt templates + runner; caching; graceful degradation; the `ai.*` ops.
**Out:** the search index (a later task calls your embeddings); feature-specific prompt wording (registered by features, but the mechanism is yours).

## 4. Requirements
### 4.1 taskType registry
Each `taskType` (e.g., `standup.draft, news.summary, news.why, charter.infer, drift.check, poc.summary, poc.retro, report.<kind>, doc.draft, doc.qa, meeting.extract, merge.assist, diff.summary, dailies.pack`) declares: its prompt template id, default `qualityTier`, default model, and whether structured output is required. Features register types; you own the registry + runner.
### 4.2 Local LLM + embeddings (default Ollama)
Talk to the local runtime over its local API for chat/generation and **embeddings** (configurable base URL). **Model management:** list installed models; pull a model with progress; select the active chat model and the active embed model (stored in local.config). **Hardware-aware default:** detect RAM/GPU and recommend a model (small ~3B for low-end; ~7B if capable) with a fallback chain (if missing/OOM, drop to a smaller model and warn). **Structured output:** support JSON/structured mode for tasks that need it (validate against the expected shape; repair/retry once on parse failure).
### 4.3 Router + budget
Routing rules exactly as in the reference block (prefer local; Claude only on polished+external, explicit choice, or quality-fallback-with-budget). Enforce a **weekly token budget** (from `cairn.config.yaml` budget policy + local overrides): estimate before any Claude call; if over cap, refuse with `Unavailable(BudgetExceeded)` and fall back to local; record every Claude call to `budget_ledger`; emit `budget.updated`. Expose `ai.getBudget` and `ai.estimate(task)`. Every Claude call is attributable (feature + action) and metered.
### 4.4 Claude client
Key from the secret store; if absent, the Claude path is disabled and the router stays fully local (features show "set a key to enable polished output"). Send **only the task's provided content**; log metadata only (never prompt/response content). Timeouts, backoff retries, hard cancel; on failure surface `Unavailable` and fall back to local where the task allows.
### 4.5 Prompt/runner + caching + degradation
Versioned prompt templates per `taskType` (changing one bumps its version → affects cache keys). The runner assembles prompt+context, calls the chosen source, enforces `maxTokens`, parses structured output, returns the contract response. **Cache** local results keyed by `(taskType, promptVersion, hash(inputs), model)` for idempotent tasks; invalidate on input/template/model change. **Degradation:** if the local runtime is unreachable, return `Unavailable(LocalModelDown)` with guidance ("start Ollama / pull a model") — never silently switch routine tasks to Claude; if both are unavailable, callers must degrade to non-AI behavior.

## 5. Acceptance criteria
- A `news.summary` task runs fully locally (0 budget spend), returns the contract response, is cached, and is re-served without recompute.
- A `report.weekly` task with `qualityTier='polished', external=true` routes to Claude, records to the ledger, and emits `budget.updated`; with the key absent OR budget exceeded it falls back to local with a clear flag.
- A structured task (`meeting.extract`) returns validated structured output; malformed output is repaired/retried once then errors cleanly.
- Hardware detection yields a sensible default model; a missing model triggers fallback + warning.
- Tests: the ledger logs metadata only; **no Claude call occurs for local-tier tasks**; provide mock Ollama + mock Claude doubles for other tasks to use.
- `/docs/architecture/ai-contract.md` + the taskType registry are published.

## 6. Handoff notes
The search task uses your embeddings; features call `ai.complete` with their `taskType`; the settings screen exposes model/budget/routing over this engine. Ship the mock doubles for downstream tests.

## 7. Risks / open questions
Token-estimate accuracy — use the model tokenizer where possible. Keep prompt version history so outputs are reproducible.
