# Cairn Build Spec 19 · Feature: Settings & AI config

**Build order:** Feature (needs UI shell + data layer + AI engine; shared writes via git-sync engine). **UI reference: `Cairn-Prototype.html#settings`.**

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

### UI/design-system — reference
Reuse the existing **design system**: theme **tokens** (no hard-coded colors) and components (Card, Button [primary/ghost/sm], StatusBadge [active/idle/stalled/shipped/drift], Pill, Chip, Tag, Nudge, Modal/Overlay, Toast, Switch, Meter/burndown/alignment bars, Avatar, Breadcrumb, Table, masonry/grid). Register your screen in the sidebar nav and the content router. Attach **explain-mode info bubbles** (`{title, text, how}`) to key elements as in `Cairn-Prototype.html`. Every screen handles **loading / empty / error** states, is keyboard-navigable, meets AA contrast, and calls the core service API (never platform APIs directly). Match the prototype's specific screen for layout and copy.

### Core service API (how the UI talks to the core) — reference
The **UI never touches git, the filesystem, the DB, or the network directly** — it calls a **typed operation + event API** across a process boundary (IPC or localhost, per the folder's existing choice). Long operations return a `jobId` immediately, run on a background worker, emit `job.progress {jobId,pct,label}` and `job.done {jobId,result|error}`, and are cancelable. Errors are typed (`ValidationError, NotFound, Conflict, Unavailable, Forbidden, Internal`) with a stable `code` + user-safe `message`. Events carry minimal payloads; the UI re-fetches on an event. If this API already exists in the folder, **conform to it**; otherwise define the operations this WP introduces and document them in `/docs/architecture/service-api.md`.

### Local store — reference (per-machine; access only via the data-layer DAOs)
An embedded file DB (SQLite-class) + a local vector index live under the OS app-data dir (`cairn/cairn.db`, `index/`, `cache/`, `logs/`, `team-repo/`, `local.config.json`). Main entities: people, projects (+charter), updates, signals, decisions, apps, tickets, news_items, news_topics, docs, meetings, action_items, reports, feeds/sources, budget_ledger, jobs, sync_state, settings/kv, and the vector index (keyed by entity_type+entity_id+chunk). **Never** access the DB with raw queries from outside the data layer; **never** put secrets in the DB/config/logs (secrets → OS keychain). Per-machine/personal settings live in `local.config.json`; shared settings live in the team repo's `cairn.config.yaml`. Domain-model types are shared across the app; reuse them.

### AI task contract — reference (call AI ONLY through this engine)
Request: `{ taskType, inputs, qualityTier:'fast'|'polished', external:bool, maxTokens?, temperature?, context? }`. Response: `{ text|structured, model, source:'local'|'claude', tokensIn, tokensOut, estCost, cached, truncated }`. **Routing:** prefer **local** (Ollama, 0 token cost). Escalate to **Claude** only when *(a)* `qualityTier='polished'` AND `external=true`, OR *(b)* the user explicitly chose "Polished", OR *(c)* a "quality fallback" setting is on AND the local result fails a check AND budget remains. A **weekly token budget** is enforced: estimate before any Claude call; if it would exceed the cap, refuse and fall back to local; record every Claude call to a budget ledger and emit `budget.updated`. Never call Claude for local-tier/routine tasks. If the local runtime is down, return a clear `Unavailable` and degrade (don't silently use Claude). Embeddings are produced locally by this engine too.

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

---

## 1. Goal
One place to tune the local/Claude balance, WIP signals, the team repo + connectors, feeds, the GitHub bootstrap, and the privacy posture — writing each setting to the right place (local config, OS keychain, or the team repo). Reproduce `#settings`.

## 2. Requirements
- **Local model (Ollama):** show detected hardware + recommendation; select active chat + embed models; pull a model with progress; a "run fully offline" toggle. (via `ai.listModels` + the AI engine.)
- **Claude (selective):** weekly **token budget** + usage **meter** (from the budget ledger); **routing rules** toggles (escalate when external/polished; quality fallback). Manage the API **key** (stored in the OS keychain via the secret store; never shown after save).
- **WIP signals:** emit on/off; refresh cadence; **"share code in signals" is hard-off** (display as locked/explained — a privacy invariant); unpushed-branch nudge threshold (days).
- **Team repository & connectors:** remote URL; auto-pull on launch; optional CI nightly-digest note; a **GitHub bootstrap** card (status + "Sync now" / token); **Slack** (news + announcements) optional; **ticket source** (email/Slack) optional. Connector **Test** buttons (`settings.testConnector`) validate config.
- **News feeds:** add/remove/enable feeds (local overrides + shared from `cairn.config.yaml`).
- **Privacy & data:** restate the posture (on-device AI; team state in your repo; signals = metadata not code; meeting audio on-device; Claude only on explicit/route); link to logs/data dir.
- **Persistence routing (make the UI show which is which):** per-user/per-machine → `local.config.json`; secrets → OS keychain; **shared** settings (feeds, budget policy, roles, on-call) → the team `cairn.config.yaml` **via the git engine**.
- **Ops used:** `settings.get/set(patch)/testConnector/getBudget`, `ai.listModels`, a model-pull job, `git.*` for shared writes. Subscribe to `budget.updated`.

## 3. Acceptance criteria
- Changing the active model / budget / cadence persists and changes behavior (new budget enforced by the AI engine; cadence changes collector scheduling).
- API key + GitHub token stored in the keychain, never rendered back or logged (test).
- Turning **emit WIP signals off** stops emission — verify; "share code" cannot be enabled.
- Connector "Test" validates a mock connector; shared settings write to the team repo, personal settings to local.config (verify routing).

## 4. Handoff / Risks
Document the settings map (which setting lives where). Never leak secrets to the team repo or logs (assert in tests).
