// qa-spec: S5, S12 — Every namespace.op resolves through the router to a
// typed `CoreServiceResult<T>`. `system.getStatus` returns ok:true with a
// non-empty apiVersion, and every other namespace-scoped stub returns
// ok:false with `error.code === 'not_implemented'` (or the router-level
// `not_implemented` when no service handler is bound).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    on: vi.fn(),
  },
  webContents: {
    getAllWebContents: vi.fn(() => []),
  },
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
  app: { getVersion: vi.fn(() => '0.0.0') },
  BrowserWindow: vi.fn(),
}));

import { OP_NAMESPACES } from '../../src/shared/ipc/operations';
import type { QualifiedOpId } from '../../src/shared/ipc/operations';
import { buildHandlerTable } from '../../src/main/ipc/register-handlers';
import { createIpcRouter, expectedQualifiedIds } from '../../src/main/ipc/router';
import { resetServiceContextForTests } from '../../src/main/services/service-context';
import type { CoreServiceResult } from '../../src/contracts/core-service.contract';

const SAFE_INPUT: Record<QualifiedOpId, unknown> = {
  'system.getStatus': {},
  'system.getFlags': {},
  'system.getPaths': {},
  'system.openExternal': { url: 'https://example.com' },
  'system.exportDiagnostics': {},
  'setup.getState': {},
  'setup.run': {},
  'setup.cancel': {},
  'git.getSyncState': {},
  'git.pull': {},
  'git.push': {},
  'git.listLocalRepos': {},
  'git.addLocalRepo': { path: '/projects/cairn' },
  'projects.list': {},
  'projects.get': { projectId: 'p-1' },
  'projects.create': { name: 'p-1' },
  'projects.updateCharter': { projectId: 'p-1', charter: { body: 'x' } },
  'projects.setStatus': { projectId: 'p-1', status: 'active' },
  'projects.archive': { projectId: 'p-1' },
  'projects.generateRetro': { projectId: 'p-1' },
  'today.getDashboard': {},
  'today.getContextResume': {},
  'today.getStandupDraft': {},
  'today.approveStandup': {},
  'today.regenerateStandup': {},
  'dailies.getPack': {},
  'dailies.getWipRadar': {},
  'dailies.listActionItems': {},
  'dailies.setActionItem': { id: 'a-1', status: 'done' },
  'dailies.nudgeUnpushed': { personId: 'person-1' },
  'news.listFeed': {},
  'news.getItem': { itemId: 'n-1' },
  'news.save': { itemId: 'n-1' },
  'news.listKnowledge': {},
  'search.query': { q: 'hello' },
  'search.askDocs': { q: 'hello' },
  'docs.tree': {},
  'docs.get': { docId: 'd-1' },
  'docs.create': { title: 'Doc', group: 'general' },
  'docs.save': { docId: 'd-1', body: '# Doc' },
  'docs.syncRepos': {},
  'docs.listDrafts': {},
  'meetings.start': { title: 'kickoff', consent: true },
  'meetings.stop': {},
  'meetings.getLive': {},
  'meetings.getProposals': { meetingId: 'm-1' },
  'meetings.applyProposal': { meetingId: 'm-1', proposalId: 'p-1' },
  'meetings.applyAll': { meetingId: 'm-1' },
  'meetings.get': { meetingId: 'm-1' },
  'reports.templates': {},
  'reports.generate': { kind: 'weekly' },
  'reports.export': { reportId: 'r-1', format: 'md' },
  'reports.pushToRepo': { reportId: 'r-1' },
  'pulse.get': {},
  'pulse.generateWeeklyDigest': {},
  'support.listApps': {},
  'support.getApp': { appId: 'app-1' },
  'support.listTickets': {},
  'support.triageTicket': { ticketId: 't-1' },
  'support.resolveTicket': { ticketId: 't-1', resolution: 'fixed' },
  'settings.get': {},
  'settings.set': { key: 'k', value: 1 },
  'settings.testConnector': { connector: 'github' },
  'settings.getBudget': {},
  'ai.complete': { taskType: 'chat', inputs: 'hi' },
  'ai.estimate': { taskType: 'chat', inputs: 'hi' },
  'ai.listModels': {},
  'ai.getBudget': {},
  'jobs.start': { kind: 'sample-long-job' },
  'jobs.cancel': { jobId: 'j-1' },
  'jobs.status': { jobId: 'j-1' },
};

function inputFor(id: QualifiedOpId): unknown {
  const preset = (SAFE_INPUT as Record<string, unknown>)[id];
  return preset ?? {};
}

function makeRouter() {
  resetServiceContextForTests();
  const table = buildHandlerTable();
  return createIpcRouter({ handlers: table });
}

afterEach(() => {
  resetServiceContextForTests();
});

describe('ipc-router — handler coverage (S5)', () => {
  it('buildHandlerTable produces a non-empty table', () => {
    const table = buildHandlerTable();
    expect(Object.keys(table).length).toBeGreaterThan(0);
  });

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
  it(
    'every dispatch returns a CoreServiceResult (never throws)',
    async () => {
      const router = makeRouter();
      for (const id of expectedQualifiedIds()) {
        const result = await router.dispatch(id, inputFor(id));
        expect(result, `${id} did not return a result`).toBeDefined();
        expect(typeof result.ok, `${id}.ok must be boolean`).toBe('boolean');
        const withVersion = result as CoreServiceResult<unknown> & { apiVersion: string };
        expect(typeof withVersion.apiVersion, `${id}.apiVersion must be string`).toBe('string');
        expect(withVersion.apiVersion.length).toBeGreaterThan(0);
      }
    },
    120_000,
  );

  it('system.getStatus dispatches to ok:true with apiVersion', async () => {
    const router = makeRouter();
    const result = await router.dispatch('system.getStatus', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ ready: true });
      expect((result.data as { runtime?: unknown }).runtime).toBeDefined();
      expect(typeof result.apiVersion).toBe('string');
      expect(result.apiVersion.length).toBeGreaterThan(0);
    }
  });
});

import Database from 'better-sqlite3';

function nativeDbAvailable(): boolean {
  try {
    const db = new Database(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}

describe('ipc-router — implemented services (S12)', () => {
  it('git.listLocalRepos returns ok:true with repos', async () => {
    if (!nativeDbAvailable()) {
      return;
    }
    const router = makeRouter();
    const result = await router.dispatch('git.listLocalRepos', {});
    expect(result.ok).toBe(true);
  });

  it.skipIf(!nativeDbAvailable())('projects.list returns ok:true with projects', async () => {
    const router = makeRouter();
    const result = await router.dispatch('projects.list', {});
    expect(result.ok).toBe(true);
  });

  it('jobs.start without manager returns not_implemented', async () => {
    const router = makeRouter();
    const result = await router.dispatch('jobs.start', { kind: 'sample-long-job' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_implemented');
    }
  });
});

describe('ipc-router — OP_NAMESPACES enumeration (S5)', () => {
  it('expectedQualifiedIds() enumerates one id per declared op', () => {
    let expectedCount = 0;
    for (const ns of Object.keys(OP_NAMESPACES)) {
      expectedCount += OP_NAMESPACES[ns as keyof typeof OP_NAMESPACES].length;
    }
    expect(expectedQualifiedIds().length).toBe(expectedCount);
  });
});
