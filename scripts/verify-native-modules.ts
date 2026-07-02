/**
 * Native-module verification for Cairn.
 *
 * This script confirms that the three native-module pieces of the Cairn stack
 * are wired together correctly:
 *
 *   1. `better-sqlite3` loads (i.e. was rebuilt against the current Electron /
 *      Node ABI by `electron-builder install-app-deps` / `@electron/rebuild`).
 *   2. The `sqlite-vec` loadable extension can be located and loaded against a
 *      live `better-sqlite3` handle via `db.loadExtension(...)`.
 *   3. A `vec0` virtual table can actually be created — which exercises both
 *      the extension load AND the SQLite `load_extension` capability of the
 *      underlying `better-sqlite3` build.
 *
 * The script is deliberately side-effect-free (it creates and removes a temp
 * SQLite file) so it is safe to run repeatedly under `pnpm exec tsx
 * scripts/verify-native-modules.ts` — for example from `postinstall`, from CI,
 * or interactively by a developer diagnosing a native-module problem.
 *
 * Helpers (`resolveSqliteVecExtensionPath`, `verifyNativeModules`) are exported
 * so the corresponding Vitest smoke test can run the same checks in-process
 * without shelling out.
 */

import Database from 'better-sqlite3';
import { getLoadablePath } from 'sqlite-vec';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The three checks that must all succeed for the native-module stack to be
 * considered healthy. `betterSqlite3Version` is the SQLite version reported by
 * the loaded better-sqlite3 build (surfaced for diagnostics, not a pass/fail
 * signal on its own).
 */
export interface NativeModuleVerification {
  betterSqlite3Loaded: boolean;
  sqliteVersion: string;
  sqliteVecLoaded: boolean;
  sqliteVecVersion: string;
  vec0TableCreated: boolean;
}

/**
 * Resolve the absolute path to the `sqlite-vec` loadable extension shipped by
 * the currently-installed `sqlite-vec` package. Isolated as its own export so
 * the smoke test can assert the resolver behaviour without duplicating the
 * lookup logic, and so a future shim (e.g. bundled extension) has exactly one
 * place to change.
 */
export function resolveSqliteVecExtensionPath(): string {
  // `sqlite-vec` publishes prebuilt binaries for common platforms and exposes
  // their absolute path via `getLoadablePath()`. If that ever needs to be
  // overridden (dev override, custom-built extension), this is the single
  // choke-point to add the fallback.
  const path = getLoadablePath();
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(
      'sqlite-vec did not resolve a loadable-extension path — is a prebuilt binary available for this platform/arch?',
    );
  }
  return path;
}

/**
 * Runs the three-part smoke check against a throwaway on-disk SQLite database
 * and returns a structured result. The temp file is created under the OS temp
 * dir and always cleaned up, even if a check throws — the caller does not need
 * to manage any lifecycle.
 */
export function verifyNativeModules(): NativeModuleVerification {
  const tempDir = mkdtempSync(join(tmpdir(), 'cairn-verify-native-'));
  const dbPath = join(tempDir, 'verify.sqlite');

  // Explicit `Database` typing — better-sqlite3's default export IS the
  // constructor; we type the instance for clarity in the finally block.
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath);

    const sqliteVersionRow = db
      .prepare('SELECT sqlite_version() AS version')
      .get() as { version: string };

    const extensionPath = resolveSqliteVecExtensionPath();
    db.loadExtension(extensionPath);

    const vecVersionRow = db
      .prepare('SELECT vec_version() AS version')
      .get() as { version: string };

    // Creating a vec0 virtual table is the strongest end-to-end proof that
    // the extension is functional against this better-sqlite3 build — a
    // simple `SELECT vec_version()` only proves the extension registered.
    db.exec('CREATE VIRTUAL TABLE vec_smoke USING vec0(embedding float[4])');

    return {
      betterSqlite3Loaded: true,
      sqliteVersion: sqliteVersionRow.version,
      sqliteVecLoaded: true,
      sqliteVecVersion: vecVersionRow.version,
      vec0TableCreated: true,
    };
  } finally {
    if (db !== null) {
      try {
        db.close();
      } catch {
        // Best-effort close — if the DB never opened successfully we
        // still want to remove the temp dir.
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * CLI entrypoint. Only runs when this file is executed directly (not when
 * imported by the Vitest smoke test), so the module has no import-time side
 * effects.
 */
async function main(): Promise<void> {
  try {
    const result = verifyNativeModules();
    process.stdout.write(
      `Native-module verification passed:\n${JSON.stringify(result, null, 2)}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Native-module verification FAILED: ${message}\n`);
    if (error instanceof Error && error.stack !== undefined) {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exitCode = 1;
  }
}

// ESM direct-execution guard: only run `main()` when this file was invoked as
// the process entrypoint (e.g. `tsx scripts/verify-native-modules.ts`), not
// when imported by tests.
const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  void main();
}
