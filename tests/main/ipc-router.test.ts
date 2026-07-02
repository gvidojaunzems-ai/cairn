// qa-spec: S5, S12 — Every namespace.op resolves through the router to a
// typed `CoreServiceResult<T>`. `system.getStatus` returns ok:true with a
// non-empty apiVersion, and every other namespace-scoped stub returns
// ok:false with `error.code === 'not_implemented'` (or the router-level
// `not_implemented` when no service handler is bound).
import { describe, expect, it, vi } from 'vitest';

// register-handlers.ts imports `electron`; mock it so this test can run
// under plain Node without a real Electron process.
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    on: vi.fn(),
  },
  webContents: {
    getAllWebContents: vi.fn(() => []),
  },
  app: { getVersion: vi.fn(() => '0.0.0') },
  BrowserWindow: vi.fn(),
}));

import { OP_NAMESPACES } from '../../src/shared/ipc/operations';
import type { QualifiedOpId } from '../../src/shared/ipc/operations';
import { buildHandlerTable } from '../../src/main/ipc/register-handlers';
import { createIpcRouter, expectedQualifiedIds } from '../../src/main/ipc/router';
import type { CoreServiceResult } from '../../src/contracts/core-service.contract';

/**
 * Non-crashing input for every op we dispatch. When the schema requires a
 * field (e.g. `{ repoId: string }`) we pass a minimal valid value so the
 * validation step succeeds and dispatch reaches the handler. Ops with
 * `EmptyInput` schemas take `{}`.
 */
const SAFE_INPUT: Record<QualifiedOpId, unknown> = {
  'system.getStatus': {},
  'system.getApiVersion': {},
  'setup.getState': {},
  'setup.complete': {},
  'git.list': {},
  'git.status': { repoId: 'r-1' },
  'projects.list': {},
  'projects.create': { name: 'p-1' },
  'projects.remove': { projectId: 'p-1' },
  'today.get': {},
  'dailies.list': {},
  'dailies.create': { date: '2026-01-01' },
  'news.list': {},
  'news.refresh': {},
  'search.query': { q: 'hello' },
  'docs.list': {},
  'docs.get': { docId: 'd-1' },
  'meetings.list': {},
  'meetings.create': { title: 'kickoff' },
  'reports.list': {},
  'reports.generate': { kind: 'weekly' },
  'pulse.get': {},
  'support.submit': { message: 'hi' },
  'settings.get': {},
  'settings.set': { key: 'k', value: 1 },
  'ai.chat': { prompt: 'hi' },
  'ai.embed': { text: 'hi' },
  'jobs.start': { kind: 'sample-long-job' },
  'jobs.cancel': { jobId: 'j-1' },
  'jobs.status': { jobId: 'j-1' },
};

function inputFor(id: QualifiedOpId): unknown {
  const preset = (SAFE_INPUT as Record<string, unknown>)[id];
  return preset ?? {};
}

function makeRouter() {
  const table = buildHandlerTable();
  return createIpcRouter({ handlers: table });
}

describe('ipc-router — handler coverage (S5)', () => {
  // qa-spec: S5
  it('buildHandlerTable produces a non-empty table', () => {
    const table = buildHandlerTable();
    expect(Object.keys(table).length).toBeGreaterThan(0);
  });

  // qa-spec: S5
  it('every declared namespace.op has a registered handler', () => {
    const table = buildHandlerTable();
    const missing: QualifiedOpId[] = [];
    for (const id of expectedQualifiedIds()) {
      if (table[id] === undefined) {
        missing.push(id);
      }
    }
    expect(missing, `missing handlers: ${JSON.stringify(missing)}`).toEqual([]);
  });
});

describe('ipc-router — dispatch shape (S5)', () => {
  // qa-spec: S5 — every dispatch resolves to a CoreServiceResult.
  it('every dispatch returns a CoreServiceResult (never throws)', async () => {
    const router = makeRouter();
    for (const id of expectedQualifiedIds()) {
      const result = await router.dispatch(id, inputFor(id));
      expect(result, `${id} did not return a result`).toBeDefined();
      expect(typeof result.ok, `${id}.ok must be boolean`).toBe('boolean');
      // apiVersion is present on both arms of the discriminated union.
      const withVersion = result as CoreServiceResult<unknown> & { apiVersion: string };
      expect(
        typeof withVersion.apiVersion,
        `${id}.apiVersion must be string`,
      ).toBe('string');
      expect(withVersion.apiVersion.length).toBeGreaterThan(0);
    }
  });

  // qa-spec: S1 — the one real success case reachable through the router.
  it('system.getStatus dispatches to ok:true with apiVersion', async () => {
    const router = makeRouter();
    const result = await router.dispatch('system.getStatus', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ ready: true });
      expect(typeof result.apiVersion).toBe('string');
      expect(result.apiVersion.length).toBeGreaterThan(0);
    }
  });
});

describe('ipc-router — stubs return uniform not_implemented (S12)', () => {
  // qa-spec: S12 — pick a representative stub op from a non-system namespace
  // that is NOT wired to a real handler (git.list is a canonical stub).
  it("git.list stub returns ok:false with code='not_implemented'", async () => {
    const router = makeRouter();
    const result = await router.dispatch('git.list', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_implemented');
      expect(typeof result.error.message).toBe('string');
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  // qa-spec: S12 — projects.list is another canonical stub.
  it("projects.list stub returns ok:false with code='not_implemented'", async () => {
    const router = makeRouter();
    const result = await router.dispatch('projects.list', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_implemented');
    }
  });

  // qa-spec: S12 — enumerate every stub and assert uniform shape.
  it('every non-system stub returns code=not_implemented uniformly', async () => {
    const router = makeRouter();
    const failures: string[] = [];
    for (const id of expectedQualifiedIds()) {
      // Skip the two real ops (system) and the jobs.* control plane (which
      // may return not_implemented on the "no manager" path but its shape
      // is still checked in the router — separately tested below).
      if (id === 'system.getStatus' || id === 'system.getApiVersion') {
        continue;
      }
      const result = await router.dispatch(id, inputFor(id));
      if (result.ok) {
        failures.push(`${id} unexpectedly returned ok:true`);
        continue;
      }
      if (result.error.code !== 'not_implemented') {
        failures.push(`${id} returned code=${result.error.code}, expected not_implemented`);
      }
      if (typeof result.error.message !== 'string' || result.error.message.length === 0) {
        failures.push(`${id} has empty error.message`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe('ipc-router — OP_NAMESPACES enumeration (S5)', () => {
  // qa-spec: S5 — the router mirrors what the shared descriptor declares.
  it('expectedQualifiedIds() enumerates one id per declared op', () => {
    let expectedCount = 0;
    for (const ns of Object.keys(OP_NAMESPACES)) {
      expectedCount += OP_NAMESPACES[ns as keyof typeof OP_NAMESPACES].length;
    }
    expect(expectedQualifiedIds().length).toBe(expectedCount);
  });
});
