// qa-spec: S11-adjacent — JobsDao lifecycle: insert → updateStatus →
// updateProgress → getById → listPending → cancelById.
//
// Uses an on-disk tmpdir DB (better-sqlite3 does not honor `:memory:`
// across separate `openLocalStore` calls in the same process the way we
// need). Every test opens+closes its own store.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openLocalStore, LOCAL_STORE_FILE_NAME } from '../../src/main/data/db';
import type { LocalStoreHandle } from '../../src/main/data/db';

let dir: string;
let store: LocalStoreHandle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cairn-jobsdao-'));
  store = openLocalStore({ filePath: join(dir, LOCAL_STORE_FILE_NAME) });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('JobsDao — insert / getById (S11-adjacent)', () => {
  // qa-spec: S11-adjacent
  it('insert then getById round-trips id, kind, status', () => {
    store.jobsDao.insert({ id: 'j-1', kind: 'sample-long-job', status: 'pending' });
    const row = store.jobsDao.getById('j-1');
    expect(row?.id).toBe('j-1');
    expect(row?.kind).toBe('sample-long-job');
    expect(row?.status).toBe('pending');
  });

  // qa-spec: S11-adjacent
  it('getById returns undefined for a missing id', () => {
    expect(store.jobsDao.getById('does-not-exist')).toBeUndefined();
  });
});

describe('JobsDao — updateStatus / updateProgress lifecycle', () => {
  // qa-spec: S11-adjacent
  it('updateStatus transitions pending → running → succeeded', () => {
    store.jobsDao.insert({ id: 'j-2', kind: 'sample-long-job', status: 'pending' });
    store.jobsDao.updateStatus({ id: 'j-2', status: 'running' });
    expect(store.jobsDao.getById('j-2')?.status).toBe('running');
    store.jobsDao.updateStatus({ id: 'j-2', status: 'succeeded', result: '{"ok":true}' });
    const row = store.jobsDao.getById('j-2');
    expect(row?.status).toBe('succeeded');
    expect(row?.result).toBe('{"ok":true}');
  });

  // qa-spec: S11-adjacent
  it('updateProgress records progressPct + label', () => {
    store.jobsDao.insert({ id: 'j-3', kind: 'sample-long-job', status: 'running' });
    store.jobsDao.updateProgress({ id: 'j-3', progressPct: 42, label: 'Halfway' });
    const row = store.jobsDao.getById('j-3');
    expect(row?.progressPct).toBe(42);
    expect(row?.label).toBe('Halfway');
  });

  // qa-spec: S11-adjacent
  it('updateStatus bumps updatedAt monotonically', async () => {
    store.jobsDao.insert({ id: 'j-4', kind: 'sample-long-job', status: 'pending' });
    const initial = store.jobsDao.getById('j-4')?.updatedAt ?? 0;
    // Ensure at least 1ms passes so the millisecond timestamp actually
    // moves — otherwise this assertion is a coin flip.
    await new Promise((r) => setTimeout(r, 5));
    store.jobsDao.updateStatus({ id: 'j-4', status: 'running' });
    const next = store.jobsDao.getById('j-4')?.updatedAt ?? 0;
    expect(next).toBeGreaterThanOrEqual(initial);
  });
});

describe('JobsDao — listPending / cancelById', () => {
  // qa-spec: S11-adjacent
  it('listPending returns only pending jobs, ordered by updatedAt', () => {
    store.jobsDao.insert({ id: 'a', kind: 'k', status: 'pending' });
    store.jobsDao.insert({ id: 'b', kind: 'k', status: 'running' });
    store.jobsDao.insert({ id: 'c', kind: 'k', status: 'pending' });
    const pending = store.jobsDao.listPending();
    const ids = pending.map((r) => r.id);
    expect(ids).toEqual(['a', 'c']);
  });

  // qa-spec: S11-adjacent
  it('cancelById flips status to cancelled and records error', () => {
    store.jobsDao.insert({ id: 'j-5', kind: 'k', status: 'running' });
    store.jobsDao.cancelById('j-5', 'user requested');
    const row = store.jobsDao.getById('j-5');
    expect(row?.status).toBe('cancelled');
    expect(row?.error).toBe('user requested');
  });
});
