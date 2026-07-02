# Service API reference

Generated verbatim from the shared IPC descriptor layer
(`src/shared/ipc/operations.ts`, `src/shared/ipc/events.ts`,
`src/shared/ipc/api-version.ts`). If this doc drifts from those files,
the parity test at `tests/docs/service-api.test.ts` fails loud.

## API version

The current transport contract version:

- **`apiVersion` = `2.0.0`**

Every `CoreServiceResult<T>` returned from the main process embeds this
string. Bumping it is a breaking-change signal — see ADR 0007.

## Operation namespaces

There are **sixteen (16)** namespaces exposed on `window.cairn.invoke`:

1. `system`
2. `setup`
3. `git`
4. `projects`
5. `today`
6. `dailies`
7. `news`
8. `search`
9. `docs`
10. `meetings`
11. `reports`
12. `pulse`
13. `support`
14. `settings`
15. `ai`
16. `jobs`

### Per-namespace operations

- `system` — `getStatus`, `getFlags`, `getPaths`, `openExternal`
- `setup` — `getState`, `run`, `cancel`
- `git` — `getSyncState`, `pull`, `push`, `listLocalRepos`, `addLocalRepo`
- `projects` — `list`, `get`, `create`, `updateCharter`, `setStatus`, `archive`, `generateRetro`
- `today` — `getDashboard`, `getContextResume`, `getStandupDraft`, `approveStandup`, `regenerateStandup`
- `dailies` — `getPack`, `getWipRadar`, `listActionItems`, `setActionItem`, `nudgeUnpushed`
- `news` — `listFeed`, `getItem`, `save`, `listKnowledge`
- `search` — `query`, `askDocs`
- `docs` — `tree`, `get`, `create`, `save`, `syncRepos`, `listDrafts`
- `meetings` — `start`, `stop`, `getLive`, `getProposals`, `applyProposal`, `applyAll`, `get`
- `reports` — `templates`, `generate`, `export`, `pushToRepo`
- `pulse` — `get`, `generateWeeklyDigest`
- `support` — `listApps`, `getApp`, `listTickets`, `triageTicket`, `resolveTicket`
- `settings` — `get`, `set`, `testConnector`, `getBudget`
- `ai` — `complete`, `estimate`, `listModels`, `getBudget`
- `jobs` — `start`, `cancel`, `status`

Every op returns a `CoreServiceResult<T>` (see ADR 0003). Long-running
work returns a `jobId` immediately and emits `job.progress` / `job.done`
events. The UI re-fetches state on domain events rather than receiving
large payloads over IPC.

## Server → UI events

There are exactly **ten (10)** event names emitted over the event bus
(`webContents.send`):

1. `sync.updated`
2. `job.progress`
3. `job.done`
4. `signals.updated`
5. `news.updated`
6. `budget.updated`
7. `meeting.partial`
8. `meeting.proposals`
9. `setup.progress`
10. `toast`

Payload shapes are declared in `src/shared/ipc/events.ts`
(`SyncUpdatedEvent`, `JobProgressEvent`, `JobDoneEvent`,
`SignalsUpdatedEvent`, `NewsUpdatedEvent`, `BudgetUpdatedEvent`,
`MeetingPartialEvent`, `MeetingProposalsEvent`, `SetupProgressEvent`,
`ToastEvent`).

Job cancellation is reported via `job.done` with
`error.code = 'cancelled'` (the legacy `job.cancelled` event was removed
in apiVersion 2.0.0).

## Renderer surface

The renderer sees a single typed API on `window.cairn`:

- `invoke(namespace, op, input?) → Promise<CoreServiceResult<T>>`
- `on(event, handler)` — subscribe to a server → UI event.
- `off(event, handler)` — unsubscribe.
- `restartApp()` — legacy fire-and-forget restart channel.

`ipcRenderer` is never re-exposed. `contextIsolation:true` and
`sandbox:true` remain unchanged on the main `BrowserWindow`.
