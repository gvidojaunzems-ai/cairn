/**
 * `today.*` service — Today dashboard aggregate.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';
const STANDUP_KEY = 'standupDraft';
const STANDUP_APPROVED_KEY = 'standupApprovedAt';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultStandupDraft() {
  return {
    yesterday: 'Merged DB layer consolidation and CI fixes.',
    today: 'Ship full UI shell and feature screens.',
    blockers: 'None',
  };
}

function buildDashboard(ctx: ServiceContext) {
  const projects = ctx.store.projectsDao.list('active');
  const focus = projects[0];
  const signals = ctx.store.wipSignalsDao.list('active');
  const news = ctx.store.newsItemsDao.list().slice(0, 3);
  const repos = ctx.teamRepoEngine.listLocalRepos();
  const sync = ctx.teamRepoEngine.getSyncState();

  return {
    greeting: 'Good morning',
    date: todayIsoDate(),
    sync,
    focusProject: focus
      ? {
          id: focus.id,
          name: focus.name,
          deadlineDays: 12,
          burndownPct: 65,
          onGoalPct: focus.name.toLowerCase().includes('agent') ? 42 : 78,
          status: focus.status,
        }
      : null,
    widgets: {
      contextResume: {
        branch: repos[0]?.branch ?? 'main',
        lastCommit: 'feat: wire Today dashboard to IPC',
        openFiles: ['src/renderer/screens/TodayScreen.tsx', 'src/main/services/today.service.ts'],
        nextStep: 'Review standup draft and approve',
      },
      standupDraft:
        (ctx.settings.get(STANDUP_KEY) as ReturnType<typeof defaultStandupDraft> | undefined) ??
        defaultStandupDraft(),
      needsAttention: repos
        .filter((r) => r.ahead > 0)
        .map((r) => ({
          id: r.id,
          label: `${r.name}: ${r.ahead} unpushed commits`,
          action: 'Push branch',
        })),
      squadWip: signals.slice(0, 5).map((s, i) => ({
        person: ctx.store.peopleDao.list()[i % 5]?.name ?? 'Teammate',
        branch: s.summary.slice(0, 30),
        unpushedDays: (i % 3) + 1,
      })),
      news: news.map((n) => ({
        id: n.id,
        title: n.title,
        why: n.summary?.slice(0, 80) ?? 'Relevant to local-first AI tooling',
      })),
      checks: [
        { name: 'CI / lint', status: 'pass' as const },
        { name: 'poc-vector-search PR', status: 'queued' as const },
      ],
      todos: [
        { file: 'src/main/index.ts', line: 246, tag: 'TODO', text: 'Wire auto-seed on first run' },
        { file: 'src/renderer/App.tsx', line: 1, tag: 'FIXME', text: 'Replace stub with shell' },
      ],
    },
    stats: {
      activePocs: projects.length,
      unpushedBranches: repos.filter((r) => r.ahead > 0).length,
      budgetUsedPct: 12,
      tokensToday: 0,
    },
  };
}

export interface TodayService {
  getDashboard(): CoreServiceResult<ReturnType<typeof buildDashboard>>;
  getContextResume(): CoreServiceResult<ReturnType<typeof buildDashboard>['widgets']['contextResume']>;
  getStandupDraft(): CoreServiceResult<ReturnType<typeof defaultStandupDraft>>;
  approveStandup(): CoreServiceResult<{ approvedAt: string }>;
  regenerateStandup(): Promise<CoreServiceResult<ReturnType<typeof defaultStandupDraft>>>;
}

export function createTodayService(ctx: ServiceContext): TodayService {
  return {
    getDashboard: () => okResult(buildDashboard(ctx)),

    getContextResume: () => okResult(buildDashboard(ctx).widgets.contextResume),

    getStandupDraft: () => {
      const draft =
        (ctx.settings.get(STANDUP_KEY) as ReturnType<typeof defaultStandupDraft> | undefined) ??
        defaultStandupDraft();
      return okResult(draft);
    },

    approveStandup: () => {
      const approvedAt = new Date().toISOString();
      ctx.settings.set(STANDUP_APPROVED_KEY, approvedAt);
      ctx.eventBus.emit('sync.updated', { entityTypes: ['updates'], at: approvedAt });
      return okResult({ approvedAt });
    },

    regenerateStandup: async () => {
      const result = await ctx.aiEngine.complete({
        taskType: 'standup.draft',
        inputs: {},
        prompt: 'Generate standup draft',
      });
      if (!result.ok) {
        return result;
      }
      const lines = result.data.text.split('\n');
      const draft = {
        yesterday: lines.find((l: string) => l.includes('Yesterday')) ? result.data.text : defaultStandupDraft().yesterday,
        today: defaultStandupDraft().today,
        blockers: defaultStandupDraft().blockers,
      };
      ctx.settings.set(STANDUP_KEY, draft);
      return okResult(draft);
    },
  };
}
