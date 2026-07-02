# Cairn Build Spec 09 · UI shell, design system & widget framework

**Build order:** UI foundation (can start once the service API exists). You DEFINE the design system later features reuse.

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

---

## 1. Goal
Build the **application shell**, the **design system**, the **explain-mode** infrastructure, and the **customizable widget framework** that every feature screen plugs into. **The visual/interaction source of truth is `Cairn-Prototype.html`** — reproduce its look, structure, copy tone, and info-bubble behavior as production-quality, themeable components. You are *defining* the design system that later feature tasks reuse.

## 2. Context & starting state
The folder has the core service API (typed op + event surface) and its client stubs/mocks. Build the UI strictly on that API.

## 3. Scope
**In:** app shell (top bar + sidebar + content router); design tokens + theming; the core component library; explain-mode/info bubbles; toast/modal/overlay services; the customizable Today widget framework; standard loading/empty/error states; the API client + event-subscription pattern; accessibility baseline. **Out:** the feature screens themselves (later tasks) and business logic.

## 4. Requirements
### 4.1 App shell & navigation
**Top bar:** brand (logo + "Cairn"); a **sync status pill** (driven by `sync.updated`/sync-state); the **Explain mode** toggle; a user avatar. **Sidebar** (grouped, matching the prototype): **Daily** (Today, Dailies, Meetings, PoC Projects, News & Knowledge); **Produce** (Reports, Team Pulse, Docs Hub); **Operate** (Support & Apps); **Configure** (Setup, Settings & AI). Active state, badges, keyboard-navigable. **Content router:** one screen at a time, per-screen scroll retention, deep-linking to a screen/entity (used by citations, "open PR", related docs). Register 11 screen slots that feature tasks fill.
### 4.2 Design tokens & theming
Centralize tokens from the prototype CSS variables (accent/teal palette, status greens/ambers/reds/blues, surfaces, borders, text, radius, shadows, spacing, typography). All components consume tokens — **no hard-coded colors**. Ship the dark theme; structure tokens so a light theme is a later drop-in. Honor OS reduced-motion.
### 4.3 Component library (production versions of the prototype parts)
Card, Button (primary/ghost/sm), Pill, StatusBadge (active/idle/stalled/shipped/drift), Chip/filter, Tag, Nudge row, Modal/Overlay, Toast service, Switch/toggle, Meter/progress + burndown bar + alignment bar, Avatar, Breadcrumb, Table, masonry/grid, and loading/empty/error placeholders. Each: documented, keyboard-accessible, AA-contrast, with component tests.
### 4.4 Explain mode & info bubbles
A global **Explain** toggle revealing **info-dot** affordances on any element; clicking a dot opens a popover with `{title, text, how}` (as in the prototype). Provide a simple API for feature screens to attach a bubble to any component. Keyboard-accessible + screen-reader friendly. Default on for first-run (configurable).
### 4.5 Customizable widget framework (for the Today dashboard)
A **widget registry**: features register `{id, title, render, defaultVisible, defaultOrder}`. A **dashboard surface** (masonry) renders enabled widgets in the user's order; a **Customize** panel to **show/hide AND reorder** widgets (e.g., move AI News to the very top). Persist visibility + order **per-user** to `local.config` via the settings ops.
### 4.6 Data/eventing pattern
A typed **API client** wrapping the service ops; a hook/util to subscribe to events and **re-fetch on change** (events carry minimal payloads). Standardize optimistic UI + error toasts mapped from the error taxonomy. Every screen handles loading/empty/error explicitly.
### 4.7 Accessibility & responsiveness
Full keyboard nav, visible focus, ARIA roles, AA contrast, reduced-motion; layout adapts to window resizing (panels collapse responsively — e.g., the docs TOC hides on narrow widths, per the prototype).

## 5. Acceptance criteria
- The shell renders with working sidebar navigation across all 11 (stub) screens; the sync pill reflects `sync.updated`; the Explain toggle reveals/hides working bubbles.
- The Customize panel **shows/hides and reorders** Today widgets; order/visibility persist across restarts (a user can make News the first widget).
- A component catalog renders every component; component/interaction tests pass; keyboard-only navigation reaches all controls; contrast checks pass.
- An architectural test confirms screens use only the API client (no direct platform access).
- `/docs/ui/` publishes the component catalog, token reference, widget-registry interface, and explain-bubble API.

## 6. Handoff notes
Feature tasks register a screen + optional widgets, consume components/tokens, and attach explain bubbles. Provide each a mock dataset so screens build before engines are wired.

## 7. Risks / open questions
Keep visual parity with the prototype while making it production/responsive; keep bundle/memory within the footprint budget.
