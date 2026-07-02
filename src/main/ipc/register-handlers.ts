/**
 * Wire the 16 op namespaces to their service implementations and to
 * Electron's `ipcMain.handle` transport.
 */
import { ipcMain } from 'electron';

import {
  OP_NAMESPACES,
  type NamespaceName,
  type QualifiedOpId,
} from '../../shared/ipc/operations.js';

import { createAiService } from '../services/ai.service.js';
import { createDailiesService } from '../services/dailies.service.js';
import { createDocsService } from '../services/docs.service.js';
import { createGitService } from '../services/git.service.js';
import { createMeetingsService } from '../services/meetings.service.js';
import { createNewsService } from '../services/news.service.js';
import { createProjectsService } from '../services/projects.service.js';
import { createPulseService } from '../services/pulse.service.js';
import { createReportsService } from '../services/reports.service.js';
import { createSearchService } from '../services/search.service.js';
import { createSettingsService } from '../services/settings.service.js';
import { createSetupService } from '../services/setup.service.js';
import { createSupportService } from '../services/support.service.js';
import { createTodayService } from '../services/today.service.js';
import {
  createJobsService,
  type JobManagerLike,
  type JobsService,
} from '../services/jobs.service.js';
import { getServiceContext } from '../services/service-context.js';
import { systemService } from '../services/system.service.js';
import type { EventBus } from './event-bus.js';

import { createEventBus } from './event-bus.js';
import { createIpcRouter, type HandlerTable, type IpcRouter } from './router.js';

interface RegisterOptions {
  jobManager?: JobManagerLike;
  eventBus?: EventBus;
}

export function buildHandlerTable(options: RegisterOptions = {}): HandlerTable {
  const eventBus = options.eventBus ?? createEventBus({ getWebContents: () => [] });
  const ctx = () => getServiceContext(eventBus);

  const jobs: JobsService = {
    start: (input) => createJobsService(options.jobManager).start(input),
    cancel: (input) => createJobsService(options.jobManager).cancel(input),
    status: (input) => createJobsService(options.jobManager, ctx().store.jobsDao).status(input),
  };

  const table: HandlerTable = {
    'system.getStatus': () => systemService.getStatus(),
    'system.getFlags': () => systemService.getFlags(),
    'system.getPaths': () => systemService.getPaths(),
    'system.openExternal': (input) => systemService.openExternal(input as { url: string }),
    'system.exportDiagnostics': () => systemService.exportDiagnostics(),

    'setup.getState': () => createSetupService(ctx()).getState(),
    'setup.run': (input) => createSetupService(ctx()).run(input as { step?: string }),
    'setup.cancel': () => createSetupService(ctx()).cancel(),

    'git.getSyncState': () => createGitService(ctx()).getSyncState(),
    'git.pull': () => createGitService(ctx()).pull(),
    'git.push': () => createGitService(ctx()).push(),
    'git.listLocalRepos': () => createGitService(ctx()).listLocalRepos(),
    'git.addLocalRepo': (input) =>
      createGitService(ctx()).addLocalRepo(input as { path: string }),

    'projects.list': () => createProjectsService(ctx()).list(),
    'projects.get': (input) =>
      createProjectsService(ctx()).get(input as { projectId: string }),
    'projects.create': (input) =>
      createProjectsService(ctx()).create(input as { name: string; description?: string }),
    'projects.updateCharter': (input) =>
      createProjectsService(ctx()).updateCharter(
        input as { projectId: string; charter: unknown },
      ),
    'projects.setStatus': (input) =>
      createProjectsService(ctx()).setStatus(input as { projectId: string; status: string }),
    'projects.archive': (input) =>
      createProjectsService(ctx()).archive(input as { projectId: string }),
    'projects.generateRetro': (input) =>
      createProjectsService(ctx()).generateRetro(input as { projectId: string }),

    'today.getDashboard': () => createTodayService(ctx()).getDashboard(),
    'today.getContextResume': () => createTodayService(ctx()).getContextResume(),
    'today.getStandupDraft': () => createTodayService(ctx()).getStandupDraft(),
    'today.approveStandup': () => createTodayService(ctx()).approveStandup(),
    'today.regenerateStandup': () => createTodayService(ctx()).regenerateStandup(),

    'dailies.getPack': (input) =>
      createDailiesService(ctx()).getPack(input as { date?: string }),
    'dailies.getWipRadar': () => createDailiesService(ctx()).getWipRadar(),
    'dailies.listActionItems': () => createDailiesService(ctx()).listActionItems(),
    'dailies.setActionItem': (input) =>
      createDailiesService(ctx()).setActionItem(input as { id: string; status: string }),
    'dailies.nudgeUnpushed': (input) =>
      createDailiesService(ctx()).nudgeUnpushed(input as { personId: string }),

    'news.listFeed': (input) =>
      createNewsService(ctx()).listFeed(input as { topic?: string; source?: string }),
    'news.getItem': (input) =>
      createNewsService(ctx()).getItem(input as { itemId: string }),
    'news.save': (input) => createNewsService(ctx()).save(input as { itemId: string }),
    'news.listKnowledge': () => createNewsService(ctx()).listKnowledge(),

    'search.query': (input) =>
      createSearchService(ctx()).query(input as { q: string; limit?: number }),
    'search.askDocs': (input) =>
      createSearchService(ctx()).askDocs(input as { q: string; docIds?: string[] }),

    'docs.tree': () => createDocsService(ctx()).tree(),
    'docs.get': (input) => createDocsService(ctx()).get(input as { docId: string }),
    'docs.create': (input) =>
      createDocsService(ctx()).create(input as { title: string; group: string; body?: string }),
    'docs.save': (input) =>
      createDocsService(ctx()).save(input as { docId: string; body: string; title?: string }),
    'docs.syncRepos': () => createDocsService(ctx()).syncRepos(),
    'docs.listDrafts': () => createDocsService(ctx()).listDrafts(),

    'meetings.start': (input) =>
      createMeetingsService(ctx()).start(input as { title: string; consent: boolean }),
    'meetings.stop': () => createMeetingsService(ctx()).stop(),
    'meetings.getLive': () => createMeetingsService(ctx()).getLive(),
    'meetings.getProposals': (input) =>
      createMeetingsService(ctx()).getProposals(input as { meetingId: string }),
    'meetings.applyProposal': (input) =>
      createMeetingsService(ctx()).applyProposal(
        input as { meetingId: string; proposalId: string },
      ),
    'meetings.applyAll': (input) =>
      createMeetingsService(ctx()).applyAll(input as { meetingId: string }),
    'meetings.get': (input) =>
      createMeetingsService(ctx()).get(input as { meetingId: string }),

    'reports.templates': () => createReportsService(ctx()).templates(),
    'reports.generate': (input) =>
      createReportsService(ctx()).generate(input as { kind: string; external?: boolean }),
    'reports.export': (input) =>
      createReportsService(ctx()).export(
        input as { reportId: string; format: 'md' | 'docx' | 'pdf' },
      ),
    'reports.pushToRepo': (input) =>
      createReportsService(ctx()).pushToRepo(input as { reportId: string }),

    'pulse.get': () => createPulseService(ctx()).get(),
    'pulse.generateWeeklyDigest': () => createPulseService(ctx()).generateWeeklyDigest(),

    'support.listApps': () => createSupportService(ctx()).listApps(),
    'support.getApp': (input) =>
      createSupportService(ctx()).getApp(input as { appId: string }),
    'support.listTickets': (input) =>
      createSupportService(ctx()).listTickets(input as { status?: string }),
    'support.triageTicket': (input) =>
      createSupportService(ctx()).triageTicket(
        input as { ticketId: string; assigneeId?: string },
      ),
    'support.resolveTicket': (input) =>
      createSupportService(ctx()).resolveTicket(
        input as { ticketId: string; resolution: string },
      ),

    'settings.get': () => createSettingsService(ctx()).get(),
    'settings.set': (input) =>
      createSettingsService(ctx()).set(input as { key: string; value: unknown }),
    'settings.testConnector': (input) =>
      createSettingsService(ctx()).testConnector(input as { connector: string }),
    'settings.getBudget': () => createSettingsService(ctx()).getBudget(),

    'ai.complete': (input) =>
      createAiService(ctx()).complete(
        input as { taskType: string; inputs: unknown; qualityTier?: string; external?: boolean },
      ),
    'ai.estimate': (input) =>
      createAiService(ctx()).estimate(input as { taskType: string; inputs: unknown }),
    'ai.listModels': () => createAiService(ctx()).listModels(),
    'ai.getBudget': () => createAiService(ctx()).getBudget(),

    'jobs.start': (input) => jobs.start(input as { kind: string; input?: unknown }),
    'jobs.cancel': (input) => jobs.cancel(input as { jobId: string }),
    'jobs.status': (input) => jobs.status(input as { jobId: string }),
  };

  return table;
}

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
    if (typeof ipcMain.removeHandler === 'function') {
      ipcMain.removeHandler(id);
    }
    ipcMain.handle(id, async (_event, input: unknown) => router.dispatch(id, input));
  }
  return router;
}
