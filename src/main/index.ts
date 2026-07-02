/**
 * Electron main-process entry point.
 *
 * Business rules:
 *   - `WINDOW_TITLE` is exported so tests and the packaging config can share
 *     the exact same literal — no drift between "the string Electron uses"
 *     and "the string the smoke test checks for".
 *   - `bootstrap()` orders side effects deliberately:
 *       1. registerErrorBoundary() — attach handlers BEFORE anything can throw
 *          so uncaught errors during startup still land in the log.
 *       2. createDirectories(resolvePaths()) — ensure the data/cache/logs
 *          directories exist before the logger writes its first line.
 *       3. openLocalStore() — placeholder hook; the real DB open lives in
 *          `src/main/data/db.ts` (owned by the database assignment).
 *       4. registerIpcChannels() — including the new namespaced router
 *          from `src/main/ipc/register-handlers.ts`.
 *       5. createMainWindow() — only after the environment is ready.
 *       6. Lazy job manager / worker init — deferred to the first
 *          non-`system.*` op so `system.getStatus` stays under 100 ms.
 *   - Security posture: BrowserWindow ALWAYS uses contextIsolation:true and
 *     sandbox:true. The preload script is the only bridge; the renderer
 *     never sees a raw ipcRenderer.
 *   - No absolute paths are hard-coded — the preload path is resolved
 *     relative to __dirname so packaged and dev layouts both work.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { registerErrorBoundary } from './error-boundary.js';
import { createDirectories, resolvePaths } from '../shared/paths.js';
import { registerIpcHandlers } from './ipc/register-handlers.js';
import { createEventBus, type EventBus } from './ipc/event-bus.js';

export const WINDOW_TITLE = 'Cairn';
export const RESTART_APP_CHANNEL = 'restart-app';

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
 * Placeholder for the local store open step. The real implementation is
 * owned by `src/main/data/db.ts` (database assignment); calling it here
 * is a no-op until that lands.
 */
function openLocalStore(): void {
  // Intentionally left blank — see the database assignment for the
  // real open path (`openLocalStore()` in `src/main/data/db.ts`).
}

let cachedEventBus: EventBus | undefined;

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

function registerIpcChannels(): void {
  registerRestartChannel();
  // The namespaced router owns every declared `namespace.op` handler.
  // Passing no `jobManager` means `jobs.*` responds with `not_implemented`
  // until the worker is lazily initialised on the first job.start call.
  registerIpcHandlers();
}

/**
 * Bootstrap the main process. Exported so tests can invoke it directly
 * without going through Electron's real lifecycle.
 */
export function bootstrap(): void {
  // Order matters — see the module JSDoc.
  registerErrorBoundary();
  createDirectories(resolvePaths());
  openLocalStore();
  registerIpcChannels();
  createMainWindow();
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
    bootstrap();
  });
}
