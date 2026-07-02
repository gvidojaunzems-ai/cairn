# Cairn Build Spec 02 · Data layer, store & domain model

**Build order:** Foundations. Assume the scaffolding task is done (runnable shell, paths/logger/flags, stack ADR). Verify in the folder.

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

---

## 1. Goal
Provide the **embedded datastore** (structured DB + local vector index), the **domain model**, migrations, the data-directory layout, the **secret store**, and config handling. This task is the **canonical definition of the local store schema and domain model** (stable contracts ② and ⑤). Later tasks access data ONLY through the layer you build.

## 2. Context & starting state
The folder contains the runnable shell + `paths`/logger/flags utilities from the scaffolding task and an ADR recording the stack. No persistence exists yet.

## 3. Scope
**In:** DB engine (embedded, file-based) + vector index; schema + migrations; a repository/DAO layer; the secret store; config (per-machine local config + typed reading of the team repo's `cairn.config.yaml`); domain types; fixtures + a working `seed`.
**Out:** writing the team repo (a later git-sync task owns ALL team-repo I/O); collectors; producing embeddings (the AI/search tasks generate vectors — you only store/query them).

## 4. Requirements
### 4.1 Data directory (under the per-OS app-data dir)
`cairn/cairn.db` (structured store) · `index/` (vector index if separate) · `cache/` (transient) · `models/` (metadata, not weights) · `logs/` · `team-repo/` (the git clone, managed by the later git task) · `local.config.json` (per-machine; **never** in any repo). Secrets never live here in plaintext (§4.5).
### 4.2 Structured schema (logical; adapt types to the engine; each row has id/created_at/updated_at and schema_version where noted)
**people**(handle, display_name, avatar_color, email?, source) · **projects**(id=slug, name, status[active|idle|stalled|shipped|archived|drift], owner_id, repo_url?, last_activity_at, next_step, charter_json{goal,success_criteria[],non_goals[],deadline,suggested_owner}, source) · **updates**(date, person_id, kind, yesterday[], today[], blockers[], raw_md, approved_at) · **signals**(date, person_id, branch, ahead_local, ahead_pushed, files_touched[], last_active_at, summary, unpushed_days) · **decisions**(id, title, status, body_md, project_id?, tags[]) · **apps**(name, owner_id, health[ok|degraded|down], last_deploy_at, error_rate?, oncall_person_id?) · **tickets**(app_id, title, priority[hi|md|lo], status[open|triaged|resolved], opened_at, assignee_id?, resolution_md?, source) · **news_items**(source, url, title, published_at, summary, why_it_matters, tags[], topic_id?, saved) · **news_topics**(label, size) · **docs**(id=path, title, group, source[manual|repo-import|ai-draft], status[ok|stale|draft], owner_id?, updated_at, body_md, meta_json) · **meetings**(date, title, summary_md, decisions[], created_at) · **action_items**(meeting_id?, text, owner_id?, status[open|done|carried], due?, source) · **reports**(type, title, engine[local|claude], body_md, grounded_refs_json, exported_paths[]) · **feeds**(name, url, kind[rss|atom|github|slack], enabled, last_fetch_at) · **budget_ledger**(ts, feature, tokens_in, tokens_out, est_cost, model) · **jobs**(type, status[queued|running|done|error], progress, payload_json, error?) · **sync_state**(key, value) · **settings/kv**(key, value_json) · **vectors** (index keyed by entity_type+entity_id+chunk_id → vector + snippet + metadata; supports upsert, delete-by-entity, top-k similarity with metadata filters).
### 4.3 Migrations
Forward-only, versioned, applied on startup; a failed migration must not corrupt data (transactional/backup-first). Refuse to open a newer-schema DB with an older app, with a clear message.
### 4.4 Repository/DAO layer
Typed accessors per entity (create/read/update/list/query) + vector ops + transactions + bulk upsert. **No engine/SQL specifics leak above this layer.** All later tasks use these accessors, never raw DB access (add an architectural test/lint rule if feasible).
### 4.5 Secret store
Keys/tokens (Claude key, GitHub token) in the **OS keychain/credential manager** only — never in `cairn.db`, `local.config.json`, the team repo, or logs. Expose `secrets.get/set/delete(name)`. If the keychain is unavailable, fall back to an encrypted local file and record the trade-off as an ADR.
### 4.6 Config
**local.config.json** (per machine, not shared): active local model, refresh cadences, enabled feeds, UI prefs (incl. Today widget order/visibility), flag overrides, watched local-repo paths. **team `cairn.config.yaml`** (in the team repo): shared feeds, budget policy, roles, on-call. Provide typed read + merge (team defaults < local overrides). **You only READ the team file here**; writing it is the git task's job.
### 4.7 Domain model
Define shared, serializable types for every entity (the canonical domain model) with status enums; document in `/docs/architecture/domain-model.md`. Every later task imports these.
### 4.8 Fixtures & seed
Provide `/fixtures` mirroring the prototype's sample squad — people: Gvido, Maria, Tom, Priya, Lars; PoCs incl. `poc-vector-search` (with a full charter), `poc-onprem-llm`, `poc-rag-eval`, `poc-slack-bot`, `poc-agent-router`, `poc-doc-extract`; plus sample news (with history/topics), docs, tickets, and WIP signals (including branches unpushed for several days). `seed` loads them so any later task runs against realistic data.

## 5. Acceptance criteria
- Fresh launch creates the data dir + DB and migrates to the current version.
- All DAOs pass CRUD/query tests; bulk upsert works; vector upsert + top-k returns correct neighbors on fixtures.
- Secrets round-trip via the OS keychain and never appear in DB/logs/repo (test asserts this).
- `seed` populates the realistic dataset.
- Opening a newer-schema DB with an older build fails safely with a message.
- `/docs/architecture/domain-model.md` and a store-schema doc are published.

## 6. Handoff notes
The service-API task builds over these DAOs; engines and features consume the domain model and never touch the DB directly. Keep DB writes off the UI thread (the API task defines a background worker).

## 7. Risks / open questions
The vector index must stay embedded/local and cross-platform. Batch/stream large writes to protect memory.
