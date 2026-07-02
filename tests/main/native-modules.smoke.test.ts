/**
 * Native-module smoke test.
 *
 * Mirrors the three checks performed by `scripts/verify-native-modules.ts` but
 * runs them in-process under Vitest so a broken native-module wiring surfaces
 * as a red test rather than a broken `pnpm dev` / `pnpm start` at runtime.
 *
 * Coverage:
 *   1. `better-sqlite3` can be required and opens a DB (i.e. the native
 *      binding matched the current Node/Electron ABI).
 *   2. `sqlite-vec`'s loadable-extension path resolves, and calling
 *      `db.loadExtension(...)` against a live `better-sqlite3` handle succeeds.
 *   3. `CREATE VIRTUAL TABLE ... USING vec0(...)` actually creates a table —
 *      end-to-end proof the extension is functional.
 *
 * Every test cleans up its temp DB file so this suite can run repeatedly in CI
 * without leaking artefacts under the OS temp dir.
 */

import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveSqliteVecExtensionPath,
  verifyNativeModules,
} from '../../scripts/verify-native-modules';

const tempDirsToCleanUp: string[] = [];

function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-smoke-native-'));
  tempDirsToCleanUp.push(dir);
  return join(dir, 'smoke.sqlite');
}

afterEach(() => {
  // Drain the accumulator on every test — Vitest reruns can otherwise stack
  // old temp dirs between file executions.
  while (tempDirsToCleanUp.length > 0) {
    const dir = tempDirsToCleanUp.pop();
    if (typeof dir === 'string' && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('native-module smoke — better-sqlite3 + sqlite-vec', () => {
  it('opens a better-sqlite3 database and reports a SQLite version', () => {
    const dbPath = createTempDbPath();
    const db = new Database(dbPath);
    try {
      const row = db
        .prepare('SELECT sqlite_version() AS version')
        .get() as { version: string };
      expect(typeof row.version).toBe('string');
      expect(row.version.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it('resolves a non-empty sqlite-vec loadable-extension path', () => {
    const extensionPath = resolveSqliteVecExtensionPath();
    expect(typeof extensionPath).toBe('string');
    expect(extensionPath.length).toBeGreaterThan(0);
  });

  it('loads the sqlite-vec extension against better-sqlite3', () => {
    const dbPath = createTempDbPath();
    const db = new Database(dbPath);
    try {
      const extensionPath = resolveSqliteVecExtensionPath();
      // Should NOT throw. If better-sqlite3 was compiled without
      // SQLITE_ENABLE_LOAD_EXTENSION, this line surfaces the failure.
      db.loadExtension(extensionPath);
      const row = db
        .prepare('SELECT vec_version() AS version')
        .get() as { version: string };
      expect(typeof row.version).toBe('string');
      expect(row.version.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it('creates a vec0 virtual table end-to-end', () => {
    const dbPath = createTempDbPath();
    const db = new Database(dbPath);
    try {
      db.loadExtension(resolveSqliteVecExtensionPath());
      // If either the extension or the better-sqlite3 build were broken,
      // this CREATE VIRTUAL TABLE would throw.
      db.exec(
        'CREATE VIRTUAL TABLE vec_smoke USING vec0(embedding float[4])',
      );
      const found = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = 'vec_smoke'",
        )
        .get() as { name: string } | undefined;
      expect(found?.name).toBe('vec_smoke');
    } finally {
      db.close();
    }
  });

  it('the aggregated verifyNativeModules() helper reports success', () => {
    // Uses its own internal temp file — no need to allocate one here.
    const result = verifyNativeModules();
    expect(result.betterSqlite3Loaded).toBe(true);
    expect(result.sqliteVecLoaded).toBe(true);
    expect(result.vec0TableCreated).toBe(true);
    expect(result.sqliteVersion.length).toBeGreaterThan(0);
    expect(result.sqliteVecVersion.length).toBeGreaterThan(0);
  });
});
