// qa-spec: S11-adjacent — JobsDao lifecycle: insert → updateStatus →
// updateProgress → getById → listPending → cancelById.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';

import { openTestStore } from '../helpers/test-db';
import type { LocalStoreHandle } from '../../src/main/db/store';

let dir: string;
let store: LocalStoreHandle;

beforeEach(() => {
  ({ store, dir } = openTestStore('cairn-jobsdao-'));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('JobsDao — insert / getById (S11-adjacent)', () => {
  it('insert then getById round-trips id, kind, status', () => {
    store.jobsDao.insert({ id: 'j-1', kind: 'sample-long-job', status: 'pending' });
    const row = store.jobsDao.getById('j-1');
    expect(row?.id).toBe('j-1');
    expect(row?.kind).toBe('sample-long-job');
    expect(row?.status).toBe('pending');
  });

  it('getById returns undefined for a missing id', () => {
    expect(store.jobsDao.getById('does-not-exist')).toBeUndefined();
  });
});

describe('JobsDao — updateStatus / updateProgress lifecycle', () => {
  it('updateStatus transitions pending → running → succeeded', () => {
    store.jobsDao.insert({ id: 'j-2', kind: 'sample-long-job', status: 'pending' });
    store.jobsDao.updateStatus({ id: 'j-2', status: 'running' });
    expect(store.jobsDao.getById('j-2')?.status).toBe('running');
    store.jobsDao.updateStatus({ id: 'j-2', status: 'succeeded', result: '{"ok":true}' });
    const row = store.jobsDao.getById('j-2');
    expect(row?.status).toBe('succeeded');
    expect(row?.result).toBe('{"ok":true}');
  });

  it('updateProgress records progressPct + label', () => {
    store.jobsDao.insert({ id: 'j-3', kind: 'sample-long-job', status: 'running' });
    store.jobsDao.updateProgress({ id: 'j-3', progressPct: 42, label: 'Halfway' });
    const row = store.jobsDao.getById('j-3');
    expect(row?.progressPct).toBe(42);
    expect(row?.label).toBe('Halfway');
  });

  it('updateStatus bumps updatedAt monotonically', () => {
    store.jobsDao.insert({ id: 'j-4', kind: 'sample-long-job', status: 'pending' });
    const first = store.jobsDao.getById('j-4')?.updatedAt ?? 0;
    store.jobsDao.updateStatus({ id: 'j-4', status: 'running' });
    const second = store.jobsDao.getById('j-4')?.updatedAt ?? 0;
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

describe('JobsDao — listPending / cancelById', () => {
  it('listPending returns only pending jobs, ordered by updatedAt', () => {
    store.jobsDao.insert({ id: 'j-a', kind: 'sample-long-job', status: 'pending' });
    store.jobsDao.insert({ id: 'j-b', kind: 'sample-long-job', status: 'running' });
    store.jobsDao.insert({ id: 'j-c', kind: 'sample-long-job', status: 'pending' });
    const pending = store.jobsDao.listPending();
    expect(pending.map((r) => r.id)).toEqual(['j-a', 'j-c']);
  });

  it('cancelById flips status to cancelled and records error', () => {
    store.jobsDao.insert({ id: 'j-x', kind: 'sample-long-job', status: 'running' });
    store.jobsDao.cancelById('j-x', 'user cancelled');
    const row = store.jobsDao.getById('j-x');
    expect(row?.status).toBe('cancelled');
    expect(row?.error).toBe('user cancelled');
  });
});
