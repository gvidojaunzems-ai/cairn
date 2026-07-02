// qa-spec: S11-adjacent — the on-disk local store opens under WAL mode,
// runs migrations, and can round-trip a job row.
//
// The DB opener under test is `src/main/data/db.ts`; it uses
// better-sqlite3 which requires a native binding compiled against the
// current Electron / Node ABI. This test uses `:memory:` to avoid
// touching the filesystem and to sidestep the electron-rebuild
// requirement for this suite.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openLocalStore, LOCAL_STORE_FILE_NAME } from '../../src/main/data/db';
import { runMigrations } from '../../src/main/data/migrations';

// A single-file SQLite path lives inside a fresh tmpdir per test so runs
// stay hermetic — no cross-test state leakage.
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cairn-db-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('main/data/db — openLocalStore (S11-adjacent)', () => {
  // qa-spec: S11-adjacent
  it('opens the DB, runs migrations, exposes db + jobsDao + close', () => {
    const store = openLocalStore({ filePath: join(dir, LOCAL_STORE_FILE_NAME) });
    expect(store.db).toBeDefined();
    expect(store.jobsDao).toBeDefined();
    expect(typeof store.close).toBe('function');
    store.close();
  });

  // qa-spec: S11-adjacent — pragmas required by ADR 0004
  it('applies WAL journal mode + foreign_keys = ON at open time', () => {
    const store = openLocalStore({ filePath: join(dir, LOCAL_STORE_FILE_NAME) });
    try {
      const journalMode = store.db.pragma('journal_mode', { simple: true });
      expect(String(journalMode).toLowerCase()).toBe('wal');
      const fkOn = store.db.pragma('foreign_keys', { simple: true });
      // SQLite returns 1 / 0 from a pragma read.
      expect(Number(fkOn)).toBe(1);
    } finally {
      store.close();
    }
  });

  // qa-spec: S11-adjacent — jobs table exists after migration 002.
  it('creates the jobs table after migrations run', () => {
    const store = openLocalStore({ filePath: join(dir, LOCAL_STORE_FILE_NAME) });
    try {
      const row = store.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'",
        )
        .get() as { name: string } | undefined;
      expect(row?.name).toBe('jobs');
    } finally {
      store.close();
    }
  });

  // qa-spec: S11-adjacent — insert + read round-trip via the DAO surface.
  it('round-trips a job row via jobsDao.insert / getById', () => {
    const store = openLocalStore({ filePath: join(dir, LOCAL_STORE_FILE_NAME) });
    try {
      store.jobsDao.insert({
        id: 'j-1',
        kind: 'sample-long-job',
        status: 'pending',
      });
      const row = store.jobsDao.getById('j-1');
      expect(row).toBeDefined();
      expect(row?.id).toBe('j-1');
      expect(row?.status).toBe('pending');
      expect(typeof row?.createdAt).toBe('number');
      expect(typeof row?.updatedAt).toBe('number');
    } finally {
      store.close();
    }
  });

  // qa-spec: S11-adjacent — migrations are idempotent
  it('runMigrations() is idempotent — second run applies 0 migrations', () => {
    const store = openLocalStore({ filePath: join(dir, LOCAL_STORE_FILE_NAME) });
    try {
      const appliedSecondRun = runMigrations(store.db);
      expect(appliedSecondRun).toBe(0);
    } finally {
      store.close();
    }
  });
});
