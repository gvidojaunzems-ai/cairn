/**
 * `projects.*` service — project CRUD backed by the local store.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import type { ProjectStatus } from '../db/dao/projects.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

export interface ProjectView {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  charter?: { id: string; title: string; body: string };
  onGoalPct: number;
  deadlineRisk: 'ok' | 'warn' | 'critical';
  driftFlag: boolean;
  driftReason?: string;
}

export interface ProjectsService {
  list(): CoreServiceResult<{ projects: ProjectView[] }>;
  get(input: { projectId: string }): CoreServiceResult<{ project: ProjectView }>;
  create(input: { name: string; description?: string }): CoreServiceResult<{ project: ProjectView }>;
  updateCharter(input: { projectId: string; charter: unknown }): CoreServiceResult<{ charter: { id: string; body: string } }>;
  setStatus(input: { projectId: string; status: string }): CoreServiceResult<{ project: ProjectView }>;
  archive(input: { projectId: string }): CoreServiceResult<{ project: ProjectView }>;
  generateRetro(input: { projectId: string }): Promise<CoreServiceResult<{ text: string }>>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function enrichProject(
  ctx: ServiceContext,
  project: { id: string; name: string; description?: string | null; status: string; createdAt: string; updatedAt: string },
): ProjectView {
  const charters = ctx.store.chartersDao.getByProject(project.id);
  const charter = charters[0];
  const driftFlag = project.name.toLowerCase().includes('agent-router');
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    charter: charter
      ? { id: charter.id, title: charter.title, body: charter.body }
      : undefined,
    onGoalPct: driftFlag ? 42 : 78,
    deadlineRisk: project.status === 'paused' ? 'warn' : 'ok',
    driftFlag,
    driftReason: driftFlag ? 'Recent commits refactor config away from charter goal' : undefined,
  };
}

const VALID_STATUSES = new Set<ProjectStatus>(['active', 'paused', 'completed', 'archived']);

export function createProjectsService(ctx: ServiceContext): ProjectsService {
  return {
    list: () => {
      const projects = ctx.store.projectsDao.list();
      return okResult({ projects: projects.map((p) => enrichProject(ctx, p)) });
    },

    get: (input) => {
      const project = ctx.store.projectsDao.get(input.projectId);
      if (project === undefined) {
        return errResult(makeError('not_found', `Project not found: ${input.projectId}`));
      }
      return okResult({ project: enrichProject(ctx, project) });
    },

    create: (input) => {
      const id = `project-${slugify(input.name)}`;
      const now = new Date().toISOString();
      const project = ctx.store.projectsDao.upsert({
        id,
        name: input.name,
        description: input.description ?? null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      ctx.store.chartersDao.upsert({
        id: `charter-${id}`,
        projectId: id,
        title: `${input.name} Charter`,
        body: `## Goal\n${input.description ?? input.name}\n\n## Success criteria\n- Demo-ready MVP\n\n## Non-goals\n- Cloud backend`,
        createdAt: now,
        updatedAt: now,
      });
      ctx.eventBus.emit('sync.updated', { entityTypes: ['projects'], at: now });
      return okResult({ project: enrichProject(ctx, project) });
    },

    updateCharter: (input) => {
      const project = ctx.store.projectsDao.get(input.projectId);
      if (project === undefined) {
        return errResult(makeError('not_found', `Project not found: ${input.projectId}`));
      }
      const charters = ctx.store.chartersDao.getByProject(input.projectId);
      const existing = charters[0];
      const now = new Date().toISOString();
      const body =
        typeof input.charter === 'string'
          ? input.charter
          : typeof input.charter === 'object' && input.charter !== null && 'body' in input.charter
            ? String((input.charter as { body: unknown }).body)
            : JSON.stringify(input.charter);
      const charter = ctx.store.chartersDao.upsert({
        id: existing?.id ?? `charter-${input.projectId}`,
        projectId: input.projectId,
        title: existing?.title ?? `${project.name} Charter`,
        body,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      return okResult({ charter: { id: charter.id, body: charter.body } });
    },

    setStatus: (input) => {
      const project = ctx.store.projectsDao.get(input.projectId);
      if (project === undefined) {
        return errResult(makeError('not_found', `Project not found: ${input.projectId}`));
      }
      if (!VALID_STATUSES.has(input.status as ProjectStatus)) {
        return errResult(makeError('validation_error', `Invalid status: ${input.status}`));
      }
      const updated = ctx.store.projectsDao.upsert({
        ...project,
        status: input.status as ProjectStatus,
      });
      return okResult({ project: enrichProject(ctx, updated) });
    },

    archive: (input) => {
      const project = ctx.store.projectsDao.get(input.projectId);
      if (project === undefined) {
        return errResult(makeError('not_found', `Project not found: ${input.projectId}`));
      }
      const updated = ctx.store.projectsDao.upsert({ ...project, status: 'archived' });
      return okResult({ project: enrichProject(ctx, updated) });
    },

    generateRetro: async (input) => {
      const project = ctx.store.projectsDao.get(input.projectId);
      if (project === undefined) {
        return errResult(makeError('not_found', `Project not found: ${input.projectId}`));
      }
      const result = await ctx.aiEngine.complete({
        taskType: 'poc.retro',
        inputs: { project: project.name },
        prompt: `Retro for ${project.name}`,
      });
      if (!result.ok) {
        return result;
      }
      return okResult({ text: result.data.text });
    },
  };
}
