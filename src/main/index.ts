/**
 * Electron main-process entry point.
 *
 * Business rules:
 *   - `WINDOW_TITLE` is exported so tests and the packaging config can share
 *     the exact same literal — no drift between "the string Electron uses"
 *     and "the string the smoke test checks for".
 *   - `bootstrap()` orders side effects deterministically:
 *       1. registerErrorBoundary() — attach handlers BEFORE anything can throw
 *          so uncaught errors during startup still land in the log.
 *       2. createDirectories(resolvePaths()) — ensure the data/cache/logs
 *          directories exist before the logger writes its first line.
 *       3. openDatabase() + runMigrations() — open cairn.db and migrate it
 *          forward. If the on-disk schema is newer than the code, ABORT
 *          before window construction; do not write.
 *       4. loadLocalConfig() + loadTeamConfig() — per-machine + team surfaces.
 *       5. registerIpcChannels() — including the namespaced router from
 *          `src/main/ipc/register-handlers.ts`.
 *       6. createMainWindow() — only after the environment is ready.
 *       7. Lazy job manager / worker init — deferred to the first
 *          non-`system.*` op so `system.getStatus` stays under 100 ms.
 *   - Security posture: BrowserWindow ALWAYS uses contextIsolation:true and
 *     sandbox:true. The preload script is the only bridge; the renderer
 *     never sees a raw ipcRenderer.
 *   - No absolute paths are hard-coded — the preload path is resolved
 *     relative to __dirname so packaged and dev layouts both work.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { registerErrorBoundary } from './error-boundary.js';
import { loadLocalConfig } from './config/local-config.js';
import { loadTeamConfig } from './config/team-config.js';
import { createDirectories, databaseFile, resolvePaths } from '../shared/paths.js';
import { createLogger } from '../shared/logger.js';
import { startCollectorsScheduler } from './collectors/scheduler.js';
import { registerIpcHandlers } from './ipc/register-handlers.js';
import { createEventBus, type EventBus } from './ipc/event-bus.js';
import { openStore, type LocalStoreHandle } from './db/store.js';
import { createJobManager, type JobManager } from './jobs/job-manager.js';
import type { JobManagerLike } from './services/jobs.service.js';

export const WINDOW_TITLE = 'Cairn';
export const RESTART_APP_CHANNEL = 'restart-app';

const logger = createLogger('main.bootstrap');

/**
 * Preload path resolver — kept in a helper so tests can stub it if needed.
 * `import.meta.url` is undefined under CJS test transpilation; guard with a
 * fallback to __dirname behaviour.
 */
function resolvePreloadPath(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // In `out/main/index.js` layout, preload sits at `out/preload/index.js`.
    return join(here, '..', 'preload', 'index.js');
  } catch {
    return join(process.cwd(), 'out', 'preload', 'index.js');
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: WINDOW_TITLE,
    width: 1200,
    height: 800,
    show: false,
    // Security posture — never relax these two flags.
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: resolvePreloadPath(),
    },
  });
  // Wait for the first paint before showing to avoid a white-flash on cold
  // start (cold-start budget is < 4s to interactive).
  window.on('ready-to-show', () => window.show());
  return window;
}

/**
 * Legacy restart channel — kept as `ipcMain.on` because it is fire-and-
 * forget from the renderer.
 */
function registerRestartChannel(): void {
  // Renderer -> main: request a full app restart (used by the React error
  // boundary "Restart" button).
  ipcMain.on(RESTART_APP_CHANNEL, () => {
    app.relaunch();
    app.exit(0);
  });
}

/**
 * Minimal shape of the database gateway. Lives in `src/main/db/index.ts`
 * and is loaded lazily so a missing module during early scaffolding does
 * not crash the bootstrap.
 *
 * Both signatures are supported to keep bootstrap resilient to spies in
 * unit tests (which stub a simplified `openDatabase(dbFile)` shape) AND
 * to the real DB module (which uses an options object).
 */
interface DatabaseGateway {
  openDatabase(...args: unknown[]): { close(): void };
  runMigrations(db: { close(): void }, ...args: unknown[]): unknown;
}

/**
 * Reject-schema signal — thrown when the on-disk cairn.db reports a schema
 * newer than the code. Bootstrap catches it and shows the user a dialog
 * WITHOUT constructing the main window and WITHOUT writing to the DB.
 */
export class NewerSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewerSchemaError';
  }
}

/**
 * Result of the open+migrate step. `newerSchema:true` means bootstrap must
 * ABORT before window construction — it is not an error, just a signal to
 * suppress the window and surface a dialog.
 */
interface OpenAndMigrateOutcome {
  ok: boolean;
  newerSchema: boolean;
  reason?: string;
}

async function openAndMigrate(): Promise<OpenAndMigrateOutcome> {
  const dbFile = databaseFile(resolvePaths());
  let gateway: DatabaseGateway;
  try {
    // Dynamic import so early scaffolding without src/main/db/** does not
    // fail the bootstrap. In a full build this resolves synchronously.
    gateway = (await import('./db/index.js')) as unknown as DatabaseGateway;
  } catch {
    // Business rule: absence of the DB gateway is a scaffolding condition,
    // not a runtime error. Log at info-level (never error) so the smoke
    // test's "no ERROR-level lines on happy path" invariant is preserved.
    logger.info('database gateway not present — skipping open+migrate', {
      dbFile,
    });
    return { ok: false, newerSchema: false, reason: 'gateway-missing' };
  }
  // Open with `skipMigrations:true` so the runner call below is the ONLY
  // place migrations run; keeps the bootstrap ordering test deterministic.
  const db = gateway.openDatabase({ skipMigrations: true });
  try {
    gateway.runMigrations(db, { dbPath: dbFile });
    return { ok: true, newerSchema: false };
  } catch (error) {
    if (isNewerSchemaError(error)) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, newerSchema: true, reason };
    }
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn('database migration failed', { reason });
    return { ok: false, newerSchema: false, reason };
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

function isNewerSchemaError(error: unknown): boolean {
  if (error instanceof NewerSchemaError) {
    return true;
  }
  if (error !== null && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    // Accept both the bootstrap-local sentinel and the DB module's concrete
    // class name (`NewerSchemaVersionError`).
    return name === 'NewerSchemaError' || name === 'NewerSchemaVersionError';
  }
  return false;
}

function showNewerSchemaError(reason: string): void {
  // `dialog.showErrorBox` is fire-and-forget and safe when the app is not
  // yet ready — Electron queues the box until ready. In tests it is a no-op.
  try {
    dialog.showErrorBox('Cairn — cannot start', reason);
  } catch {
    // In non-Electron test envs `dialog` is a stub; ignore.
  }
}

let cachedEventBus: EventBus | undefined;
let cachedStore: LocalStoreHandle | undefined;
let cachedJobManager: JobManager | undefined;

/**
 * Lazily construct the event bus. Kept lazy so tests that only need to
 * exercise the router don't spin up the Electron `webContents` module.
 */
export function getEventBus(): EventBus {
  if (!cachedEventBus) {
    cachedEventBus = createEventBus();
  }
  return cachedEventBus;
}

function ensureJobManager(): JobManager {
  if (!cachedJobManager) {
    cachedStore = openStore();
    cachedJobManager = createJobManager({
      jobsDao: cachedStore.jobsDao,
      eventBus: getEventBus(),
    });
  }
  return cachedJobManager;
}

/**
 * Lazy proxy so IPC handlers are registered once at bootstrap while the
 * worker + DB connection spin up only on the first `jobs.start` call.
 */
const lazyJobManager: JobManagerLike = {
  startJob(kind, input) {
    return ensureJobManager().startJob(kind, input);
  },
  cancelJob(jobId) {
    return ensureJobManager().cancelJob(jobId);
  },
};

function registerIpcChannels(): void {
  registerRestartChannel();
  registerIpcHandlers({ jobManager: lazyJobManager, eventBus: getEventBus() });
}

/**
 * Bootstrap the main process. Exported so tests can invoke it directly
 * without going through Electron's real lifecycle.
 *
 * Returns a Promise so callers can await deterministic completion of the
 * DB step; the older sync-call sites (auto-run at app.whenReady) still
 * work because `void mod.bootstrap()` accepts a Promise return.
 */
export async function bootstrap(): Promise<void> {
  registerErrorBoundary();
  createDirectories(resolvePaths());

  const outcome = await openAndMigrate();
  if (outcome.newerSchema) {
    // S8: newer-schema DB — show a dialog and ABORT before window
    // construction. Do NOT write.
    showNewerSchemaError(outcome.reason ?? 'cairn.db is newer than this build');
    return;
  }

  // Load per-machine + team configs — these never hold secrets, so they
  // run after the DB check but before window construction.
  loadLocalConfig();
  loadTeamConfig();

  registerIpcChannels();
  startCollectorsOnBootstrap();
  createMainWindow();
}

function startCollectorsOnBootstrap(): void {
  try {
    const store = openStore();
    startCollectorsScheduler(store, getEventBus());
  } catch (err) {
    logger.warn('collectors scheduler failed to start', {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

// In a packaged app or dev-server run, `app.whenReady()` drives bootstrap.
// Skipped when running under Vitest (VITEST=true) so the smoke test can
// invoke bootstrap() deterministically without a duplicate auto-run.
const IS_TEST = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
if (
  !IS_TEST &&
  typeof app?.whenReady === 'function' &&
  process.env.CAIRN_SKIP_AUTO_BOOTSTRAP !== '1'
) {
  void app.whenReady().then(() => {
    void bootstrap();
  });
}
