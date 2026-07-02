// qa-spec: S11-adjacent — the on-disk local store opens under WAL mode,
// runs migrations, and can round-trip a job row via the canonical db layer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';

import { DB_FILE_NAME } from '../../../src/main/db/schema';
import { runMigrations } from '../../../src/main/db/migrations/runner';
import { openTestStore } from '../../helpers/test-db';
import type { LocalStoreHandle } from '../../../src/main/db/store';

let dir: string;
let store: LocalStoreHandle;

beforeEach(() => {
  ({ store, dir } = openTestStore('cairn-db-'));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('main/db/store — openStore (S11-adjacent)', () => {
  it('opens the DB, runs migrations, exposes db + jobsDao + close', () => {
    expect(store.db).toBeDefined();
    expect(store.jobsDao).toBeDefined();
    expect(typeof store.close).toBe('function');
  });

  it('applies WAL journal mode + foreign_keys = ON at open time', () => {
    const journalMode = store.db.pragma('journal_mode', { simple: true });
    expect(String(journalMode).toLowerCase()).toBe('wal');
    const fkOn = store.db.pragma('foreign_keys', { simple: true });
    expect(Number(fkOn)).toBe(1);
  });

  it('creates the jobs table after migration 0002', () => {
    const row = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('jobs');
    expect(Number(store.db.pragma('user_version', { simple: true }))).toBe(2);
  });

  it('round-trips a job row via jobsDao.insert / getById', () => {
    store.jobsDao.insert({
      id: 'j-1',
      kind: 'sample-long-job',
      status: 'pending',
    });
    const row = store.jobsDao.getById('j-1');
    expect(row?.id).toBe('j-1');
    expect(row?.status).toBe('pending');
    expect(typeof row?.createdAt).toBe('number');
    expect(typeof row?.updatedAt).toBe('number');
  });

  it('runMigrations() is idempotent — second run applies 0 migrations', () => {
    const appliedSecondRun = runMigrations(store.db);
    expect(appliedSecondRun).toBe(0);
  });

  it('uses cairn.db as the default file name', () => {
    expect(dir).toMatch(/cairn-db-/);
    expect(DB_FILE_NAME).toBe('cairn.db');
  });
});
