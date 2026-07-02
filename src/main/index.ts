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
 *       3. createMainWindow() — only after the environment is ready.
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

function registerIpcChannels(): void {
  // Renderer -> main: request a full app restart (used by the React error
  // boundary "Restart" button).
  ipcMain.on(RESTART_APP_CHANNEL, () => {
    app.relaunch();
    app.exit(0);
  });
}

/**
 * Bootstrap the main process. Exported so tests can invoke it directly
 * without going through Electron's real lifecycle.
 */
export function bootstrap(): void {
  // Order matters — see the module JSDoc.
  registerErrorBoundary();
  createDirectories(resolvePaths());
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
