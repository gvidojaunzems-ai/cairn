# Cairn Build Spec 08 · First-run setup & cold-start bootstrap

**Build order:** After engines + UI shell (verify they exist in the folder). You sequence existing engines and add the Setup screen.

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

### Team-repo file schema — reference (all shared state; **write only via the git-sync engine**)
```
cairn-team/
  cairn.config.yaml                     # shared config: schema_version, feeds, budget policy, roles, on-call
  projects/<slug>.md                    # PoC: YAML charter frontmatter + markdown body
  updates/<YYYY-MM-DD>/<handle>.md      # per-person, per-day standup marker
  signals/<YYYY-MM-DD>/<handle>.json    # WIP metadata ONLY (never code)
  decisions/<NNNN>-<slug>.md            # ADR-lite (Context/Decision/Consequences)
  apps/<slug>.md ; apps/tickets/<id>.md # background apps + support tickets
  docs/<group>/<slug>.md                # docs hub pages (Markdown + frontmatter)
  meetings/<YYYY-MM-DD>-<slug>.md       # meeting note (summary/decisions/action items; no audio)
  news/<YYYY-MM-DD>-digest.md           # optional committed news digest
  pulse/<YYYY>-W<WW>.md                 # weekly team digest
```
Key frontmatter — **projects**: `schema_version,id,name,status[active|idle|stalled|shipped|archived|drift],owner,repo_url?,created_at,deadline?,goal,success_criteria[],non_goals[],suggested_owner?`. **updates**: `date,person,approved_at` + body `## Yesterday/## Today/## Blockers`. **signals(JSON)**: `{schema_version,person,ts,project?,branch,ahead_local,ahead_pushed,files_touched[],last_active,unpushed_days,summary}` — **summary is text only; code/diffs are forbidden**. **docs**: `title,group,source[manual|repo-import|ai-draft],status[ok|stale|draft],owner?,updated_at,tags[]`. Every artifact is human-readable and versioned by git. Partitioning: per-person/per-day files are never co-edited (conflict-free); single-owner files (projects/apps) take non-owner edits into a `## Suggestions` block. All timestamps UTC ISO-8601.

### AI task contract — reference (call AI ONLY through this engine)
Request: `{ taskType, inputs, qualityTier:'fast'|'polished', external:bool, maxTokens?, temperature?, context? }`. Response: `{ text|structured, model, source:'local'|'claude', tokensIn, tokensOut, estCost, cached, truncated }`. **Routing:** prefer **local** (Ollama, 0 token cost). Escalate to **Claude** only when *(a)* `qualityTier='polished'` AND `external=true`, OR *(b)* the user explicitly chose "Polished", OR *(c)* a "quality fallback" setting is on AND the local result fails a check AND budget remains. A **weekly token budget** is enforced: estimate before any Claude call; if it would exceed the cap, refuse and fall back to local; record every Claude call to a budget ledger and emit `budget.updated`. Never call Claude for local-tier/routine tasks. If the local runtime is down, return a clear `Unavailable` and degrade (don't silently use Claude). Embeddings are produced locally by this engine too.

### UI/design-system — reference
Reuse the existing **design system**: theme **tokens** (no hard-coded colors) and components (Card, Button [primary/ghost/sm], StatusBadge [active/idle/stalled/shipped/drift], Pill, Chip, Tag, Nudge, Modal/Overlay, Toast, Switch, Meter/burndown/alignment bars, Avatar, Breadcrumb, Table, masonry/grid). Register your screen in the sidebar nav and the content router. Attach **explain-mode info bubbles** (`{title, text, how}`) to key elements as in `Cairn-Prototype.html`. Every screen handles **loading / empty / error** states, is keyboard-navigable, meets AA contrast, and calls the core service API (never platform APIs directly). Match the prototype's specific screen for layout and copy.

### Local store — reference (per-machine; access only via the data-layer DAOs)
An embedded file DB (SQLite-class) + a local vector index live under the OS app-data dir (`cairn/cairn.db`, `index/`, `cache/`, `logs/`, `team-repo/`, `local.config.json`). Main entities: people, projects (+charter), updates, signals, decisions, apps, tickets, news_items, news_topics, docs, meetings, action_items, reports, feeds/sources, budget_ledger, jobs, sync_state, settings/kv, and the vector index (keyed by entity_type+entity_id+chunk). **Never** access the DB with raw queries from outside the data layer; **never** put secrets in the DB/config/logs (secrets → OS keychain). Per-machine/personal settings live in `local.config.json`; shared settings live in the team repo's `cairn.config.yaml`. Domain-model types are shared across the app; reuse them.

---

## 1. Goal
Make the hub **useful on day one** by orchestrating a one-time **bootstrap** that gathers real context from sources the squad already has, plus the **Setup** screen that shows progress and "what Cairn knows". (Implements the product spec's cold-start.)

## 2. Context & starting state
The folder has the git-sync engine, AI engine, collectors + scheduler, the search index (`rebuildAll`), the data layer, and the UI shell/design system. Fresh install = empty DB.

## 3. Scope
**In:** first-run detection; the bootstrap orchestrator (sequences engine steps with progress/resume); charter inference; **AI news history backfill + clustering**; the "what Cairn knows" summary; the **Setup** screen (mirror `Cairn-Prototype.html#setup`); re-run/refresh. **Out:** the individual collectors (they exist) — you sequence them; ongoing scheduling.

## 4. Requirements
### 4.1 Orchestrated steps (each a tracked job: progress, resumable, idempotent)
1. **Connect team git repo** — confirm/enter the remote; clone. If none, offer to create the structure and set a remote later.
2. **Scan local repos & infer projects** — user picks local repo paths; scan (git engine); for each repo without a project, **infer a draft charter** (goal/criteria/non-goals/deadline/suggested owner) via the AI engine (`charter.infer`) from README + commit history; create `projects/` entries (status from activity), marked "needs confirmation".
3. **Bootstrap from GitHub** (optional; needs token) — run the GitHub collector: repos, contributors, PRs/issues, history; seed people/projects/tickets + synthetic activity for non-Cairn devs.
4. **Backfill AI news history** — fetch ~12 months from configured feeds/archives; summarize + tag locally (cached); **cluster** into topics (local embeddings + clustering) and store `news_topics`. Show counts (articles/sources/topics).
5. **Build embeddings index** — run `rebuildAll` over docs/decisions/news/projects/meetings with progress.
6. **Detect local model** — hardware-aware default; offer to pull it with progress; set active chat + embed models.
7. **Import & auto-draft docs** — import READMEs/`/docs`; auto-draft pages where coverage is missing (flagged AI-draft).
8. **Invite teammates** — show how peers join (clone + connect); note each peer's local Cairn then supersedes their GitHub-derived signals.
### 4.2 Setup state & control
Persist `setup_state` (per step: pending/running/done/error + stats), overall % complete, and whether first-run is satisfied. Steps emit `setup.progress` and can be paused/cancelled/retried. The orchestrator is **re-runnable** ("Re-run setup"). **All processing is local; external reads are read-only; NO Claude calls during bootstrap** (summaries/clustering/charters use the local model). Respect privacy invariants.
### 4.3 "What Cairn knows so far"
Compute + display from the DB: repos, PoCs (with charters), contributors, historical tickets, news articles, docs (imported + drafted), decisions. Updates as steps complete.
### 4.4 Setup screen (UI)
Mirror `Cairn-Prototype.html#setup`: a progress hero (% + bar + status line); the 8-step list with status icons, per-step stats, and explain-mode info bubbles; an **AI news history** card (articles / months / topic clusters + sources + link to News); the **What Cairn knows** summary card; "Re-run setup" and per-step actions (pick repos, add token, pull model, invite). Reachable from the sidebar (Configure → Setup) after first run.
### 4.5 First-run flow
On first launch (empty DB), route to Setup and walk the steps (optional ones skippable). The app stays usable with whatever has completed; nothing blocks indefinitely.

## 5. Acceptance criteria
- Fresh install runs the wizard; afterward the app shows real, non-empty data (projects with draft charters, news with history + topics, docs, people), all sourced locally.
- News backfill produces a multi-month, clustered archive; shown counts match the DB.
- Each step reports progress, is cancelable, resumes after a restart, and is idempotent on re-run.
- **No Claude spend occurs during bootstrap** (budget ledger unchanged) — test.
- "What Cairn knows" matches DB counts. `/docs/architecture/setup.md` published.

## 6. Handoff notes
Features can assume a populated store after setup; the collectors keep it fresh thereafter.

## 7. Risks / open questions
Feed archive depth varies (some sources lack deep history) — backfill best-effort with clear reporting. Keep clustering simple/local (embedding + a standard clustering method).
