/**
 * Per-OS path resolver.
 *
 * Business rules:
 *   - The app is stateless at startup: paths are resolved from environment
 *     variables and OS conventions only. Never hard-code an absolute path.
 *   - Windows: %APPDATA%\Cairn for data/logs, %LOCALAPPDATA%\Cairn\cache.
 *     Rationale: %APPDATA% roams with the user profile; caches are machine-local.
 *   - macOS: platform-standard Application Support / Caches / Logs directories
 *     under ~/Library.
 *   - Linux: XDG Base Directory Specification with the documented fallbacks.
 *   - The join separator is chosen from `process.platform` (not from Node's
 *     compile-time `path` module) so tests that mutate `process.platform` see
 *     consistent slash conventions.
 *
 * `createDirectories` is idempotent so it can safely be called on every boot
 * (first-boot creation) without a race window.
 */
import { mkdirSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import * as pathPosix from 'node:path/posix';
import * as pathWin32 from 'node:path/win32';

export interface AppPaths {
  /** App-data directory (databases, config, feature-flags.json). */
  data: string;
  /** Cache directory (regenerable artefacts, safe to delete). */
  cache: string;
  /** Log directory (structured JSON log files with bounded rotation). */
  logs: string;
}

const APP_NAME = 'Cairn';
const APP_NAME_LOWER = 'cairn';

/**
 * Pick the correct `path` module for the given platform. Using `process.platform`
 * here (rather than Node's compile-time default in `node:path`) means tests
 * that stub the platform see Linux/macOS forward slashes even when the test
 * binary itself is running on Windows.
 */
function pathModuleFor(platform: NodeJS.Platform): typeof pathPosix {
  return platform === 'win32'
    ? (pathWin32 as unknown as typeof pathPosix)
    : pathPosix;
}

function resolveWindowsPaths(env: NodeJS.ProcessEnv, home: string): AppPaths {
  const p = pathModuleFor('win32');
  const appData = env.APPDATA ?? p.join(home, 'AppData', 'Roaming');
  const localAppData = env.LOCALAPPDATA ?? p.join(home, 'AppData', 'Local');
  return {
    data: p.join(appData, APP_NAME),
    cache: p.join(localAppData, APP_NAME, 'cache'),
    logs: p.join(appData, APP_NAME, 'logs'),
  };
}

function resolveMacPaths(home: string): AppPaths {
  const p = pathModuleFor('darwin');
  return {
    data: p.join(home, 'Library', 'Application Support', APP_NAME),
    cache: p.join(home, 'Library', 'Caches', APP_NAME),
    logs: p.join(home, 'Library', 'Logs', APP_NAME),
  };
}

function resolveLinuxPaths(env: NodeJS.ProcessEnv, home: string): AppPaths {
  const p = pathModuleFor('linux');
  const dataHome =
    env.XDG_DATA_HOME && env.XDG_DATA_HOME.length > 0
      ? env.XDG_DATA_HOME
      : p.join(home, '.local', 'share');
  const cacheHome =
    env.XDG_CACHE_HOME && env.XDG_CACHE_HOME.length > 0
      ? env.XDG_CACHE_HOME
      : p.join(home, '.cache');
  const stateHome =
    env.XDG_STATE_HOME && env.XDG_STATE_HOME.length > 0
      ? env.XDG_STATE_HOME
      : p.join(home, '.local', 'state');
  return {
    data: p.join(dataHome, APP_NAME_LOWER),
    cache: p.join(cacheHome, APP_NAME_LOWER),
    logs: p.join(stateHome, APP_NAME_LOWER, 'logs'),
  };
}

/**
 * Resolve the "home" directory in a way tests can override.
 *
 * `os.homedir()` on Windows ignores $HOME and always reads USERPROFILE, so a
 * test that sets `process.env.HOME = '/home/test'` under a Windows binary
 * would see the Windows profile path back. Reading the env vars directly
 * keeps the resolution consistent with the platform switch above.
 */
function resolveHome(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  if (platform === 'win32') {
    return env.USERPROFILE ?? env.HOME ?? osHomedir();
  }
  return env.HOME ?? osHomedir();
}

/**
 * Resolve the per-OS Cairn data/cache/logs directories.
 *
 * Reads from `process.env` and `os.homedir()` — no side effects, safe to call
 * multiple times.
 */
export function resolvePaths(): AppPaths {
  const env = process.env;
  // Read from `process.platform` (runtime-mutable) rather than `os.platform()`
  // (compile-time constant) so tests can vary the platform between cases.
  const os = process.platform;
  const home = resolveHome(os, env);

  if (os === 'win32') {
    return resolveWindowsPaths(env, home);
  }
  if (os === 'darwin') {
    return resolveMacPaths(home);
  }
  // Linux + other POSIX — XDG fallbacks.
  return resolveLinuxPaths(env, home);
}

/**
 * Ensure every directory in `paths` exists. Idempotent — creates missing
 * directories, silently succeeds when they already exist.
 */
export function createDirectories(paths: AppPaths): void {
  // `recursive: true` also makes this a no-op when the directory exists, which
  // is the behavior we want (idempotency).
  mkdirSync(paths.data, { recursive: true });
  mkdirSync(paths.cache, { recursive: true });
  mkdirSync(paths.logs, { recursive: true });
}
