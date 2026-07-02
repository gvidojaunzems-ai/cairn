# Service API reference

Generated verbatim from the shared IPC descriptor layer
(`src/shared/ipc/operations.ts`, `src/shared/ipc/events.ts`,
`src/shared/ipc/api-version.ts`). If this doc drifts from those files,
the parity test at `tests/docs/service-api.test.ts` fails loud.

## API version

The current transport contract version:

- **`apiVersion` = `1.0.0`**

Every `CoreServiceResult<T>` returned from the main process embeds this
string. Bumping it is a breaking-change signal — see ADR 0003.

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

- `system` — `getStatus`, `getApiVersion`
- `setup` — `getState`, `complete`
- `git` — `list`, `status`
- `projects` — `list`, `create`, `remove`
- `today` — `get`
- `dailies` — `list`, `create`
- `news` — `list`, `refresh`
- `search` — `query`
- `docs` — `list`, `get`
- `meetings` — `list`, `create`
- `reports` — `list`, `generate`
- `pulse` — `get`
- `support` — `submit`
- `settings` — `get`, `set`
- `ai` — `chat`, `embed`
- `jobs` — `start`, `cancel`, `status`

Every op returns a `CoreServiceResult<T>` (see ADR 0003). Only
`system.getStatus`, `system.getApiVersion`, `jobs.start`, and
`jobs.cancel` have real implementations at foundation time; every
other op returns `{ ok:false, error:{code:'not_implemented'} }`.

## Server → UI events

There are exactly **ten (10)** event names emitted over the event bus
(`webContents.send`):

1. `job.progress`
2. `job.done`
3. `job.cancelled`
4. `system.ready`
5. `system.error`
6. `settings.changed`
7. `projects.changed`
8. `sync.progress`
9. `sync.done`
10. `notification.emit`

Payload shapes are declared in `src/shared/ipc/events.ts`
(`JobProgressEvent`, `JobDoneEvent`, `JobCancelledEvent`,
`SystemReadyEvent`, `SystemErrorEvent`, `SettingsChangedEvent`,
`ProjectsChangedEvent`, `SyncProgressEvent`, `SyncDoneEvent`,
`NotificationEmitEvent`).

## Renderer surface

The renderer sees a single typed API on `window.cairn`:

- `invoke(namespace, op, input?) → Promise<CoreServiceResult<T>>`
- `on(event, handler)` — subscribe to a server → UI event.
- `off(event, handler)` — unsubscribe.
- `restartApp()` — legacy fire-and-forget restart channel.

`ipcRenderer` is never re-exposed. `contextIsolation:true` and
`sandbox:true` remain unchanged on the main `BrowserWindow`.
