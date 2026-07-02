/**
 * Wire the 16 op namespaces to their service implementations and to
 * Electron's `ipcMain.handle` transport.
 *
 * Business rules:
 *   - Every declared `namespace.op` MUST resolve to a handler here — the
 *     contract tests fail loud on missing keys.
 *   - Handlers never throw across the IPC boundary; the router traps
 *     exceptions and returns a typed `internal` error instead.
 */
import { ipcMain } from 'electron';

import {
  OP_NAMESPACES,
  type NamespaceName,
  type QualifiedOpId,
} from '../../shared/ipc/operations.js';

import {
  aiService,
  createJobsService,
  dailiesService,
  docsService,
  gitService,
  meetingsService,
  newsService,
  projectsService,
  pulseService,
  reportsService,
  searchService,
  settingsService,
  setupService,
  supportService,
  systemService,
  todayService,
  type JobManagerLike,
  type JobsService,
} from '../services/index.js';

import { createIpcRouter, type HandlerTable, type IpcRouter } from './router.js';

interface RegisterOptions {
  /**
   * Optional `JobManager` bound into the `jobs.*` service. When absent,
   * every job op returns `not_implemented` — used in tests and during
   * cold bootstrap before the worker has started.
   */
  jobManager?: JobManagerLike;
}

/**
 * Build the complete handler table. Kept as a pure function so tests can
 * drive it without touching Electron.
 */
export function buildHandlerTable(options: RegisterOptions = {}): HandlerTable {
  const jobs: JobsService = createJobsService(options.jobManager);

  const table: HandlerTable = {
    'system.getStatus': () => systemService.getStatus(),
    'system.getApiVersion': () => systemService.getApiVersion(),

    'setup.getState': () => setupService.getState(),
    'setup.complete': () => setupService.complete(),

    'git.list': () => gitService.list(),
    'git.status': (input) => gitService.status(input as { repoId: string }),

    'projects.list': () => projectsService.list(),
    'projects.create': (input) => projectsService.create(input as { name: string }),
    'projects.remove': (input) =>
      projectsService.remove(input as { projectId: string }),

    'today.get': () => todayService.get(),

    'dailies.list': () => dailiesService.list(),
    'dailies.create': (input) => dailiesService.create(input as { date: string }),

    'news.list': () => newsService.list(),
    'news.refresh': () => newsService.refresh(),

    'search.query': (input) => searchService.query(input as { q: string }),

    'docs.list': () => docsService.list(),
    'docs.get': (input) => docsService.get(input as { docId: string }),

    'meetings.list': () => meetingsService.list(),
    'meetings.create': (input) => meetingsService.create(input as { title: string }),

    'reports.list': () => reportsService.list(),
    'reports.generate': (input) =>
      reportsService.generate(input as { kind: string }),

    'pulse.get': () => pulseService.get(),

    'support.submit': (input) =>
      supportService.submit(input as { message: string }),

    'settings.get': () => settingsService.get(),
    'settings.set': (input) =>
      settingsService.set(input as { key: string; value: unknown }),

    'ai.chat': (input) => aiService.chat(input as { prompt: string }),
    'ai.embed': (input) => aiService.embed(input as { text: string }),

    'jobs.start': (input) =>
      jobs.start(input as { kind: string; input?: unknown }),
    'jobs.cancel': (input) => jobs.cancel(input as { jobId: string }),
    'jobs.status': (input) => jobs.status(input as { jobId: string }),
  };

  return table;
}

/**
 * Register `ipcMain.handle` for every declared qualified op id. Returns
 * the constructed router so bootstrap can hold a reference for shutdown
 * / tests can dispatch directly.
 */
export function registerIpcHandlers(options: RegisterOptions = {}): IpcRouter {
  const handlers = buildHandlerTable(options);
  const router = createIpcRouter({ handlers });

  const ids: QualifiedOpId[] = [];
  for (const namespace of Object.keys(OP_NAMESPACES) as NamespaceName[]) {
    for (const op of OP_NAMESPACES[namespace]) {
      ids.push(`${namespace}.${op}` as QualifiedOpId);
    }
  }

  for (const id of ids) {
    // `handle` allows one handler per channel — if a caller re-registers
    // we remove first to keep the table idempotent under hot reload.
    // Guard `removeHandler` because some Electron mocks in tests omit it.
    if (typeof ipcMain.removeHandler === 'function') {
      ipcMain.removeHandler(id);
    }
    ipcMain.handle(id, async (_event, input: unknown) => router.dispatch(id, input));
  }
  return router;
}
