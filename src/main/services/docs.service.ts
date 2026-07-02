/**
 * `docs.*` service — docs hub pages.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

const DOC_BODY_PREFIX = 'doc:body:';
const DOC_GROUP_PREFIX = 'doc:group:';
const DOC_STATUS_PREFIX = 'doc:status:';

function docBodyKey(docId: string): string {
  return `${DOC_BODY_PREFIX}${docId}`;
}

export interface DocsService {
  tree(): CoreServiceResult<{ groups: { name: string; docs: { id: string; title: string; status: string }[] }[] }>;
  get(input: { docId: string }): CoreServiceResult<{ id: string; title: string; body: string; group: string }>;
  create(input: { title: string; group: string; body?: string }): CoreServiceResult<{ id: string; title: string }>;
  save(input: { docId: string; body: string; title?: string }): CoreServiceResult<{ id: string; updatedAt: string }>;
  syncRepos(): CoreServiceResult<{ jobId: string }>;
  listDrafts(): CoreServiceResult<{ drafts: { id: string; title: string; group: string }[] }>;
}

export function createDocsService(ctx: ServiceContext): DocsService {
  return {
    tree: () => {
      const docs = ctx.store.docsDao.list();
      const groups = new Map<string, { id: string; title: string; status: string }[]>();
      for (const doc of docs) {
        const group =
          (ctx.settings.get(`${DOC_GROUP_PREFIX}${doc.id}`) as string | undefined) ?? 'general';
        const status =
          (ctx.settings.get(`${DOC_STATUS_PREFIX}${doc.id}`) as string | undefined) ?? 'ok';
        const list = groups.get(group) ?? [];
        list.push({ id: doc.id, title: doc.title, status });
        groups.set(group, list);
      }
      return okResult({
        groups: [...groups.entries()].map(([name, groupDocs]) => ({ name, docs: groupDocs })),
      });
    },

    get: (input) => {
      const doc = ctx.store.docsDao.get(input.docId);
      if (doc === undefined) {
        return errResult(makeError('not_found', `Doc not found: ${input.docId}`));
      }
      const body =
        (ctx.settings.get(docBodyKey(input.docId)) as string | undefined) ??
        `# ${doc.title}\n\nDocumentation content for ${doc.title}.`;
      const group =
        (ctx.settings.get(`${DOC_GROUP_PREFIX}${input.docId}`) as string | undefined) ?? 'general';
      return okResult({ id: doc.id, title: doc.title, body, group });
    },

    create: (input) => {
      const id = `doc-${Date.now()}`;
      const now = new Date().toISOString();
      ctx.store.docsDao.upsert({
        id,
        title: input.title,
        projectId: null,
        createdAt: now,
        updatedAt: now,
      });
      ctx.settings.set(docBodyKey(id), input.body ?? `# ${input.title}\n`);
      ctx.settings.set(`${DOC_GROUP_PREFIX}${id}`, input.group);
      ctx.settings.set(`${DOC_STATUS_PREFIX}${id}`, 'draft');
      return okResult({ id, title: input.title });
    },

    save: (input) => {
      const doc = ctx.store.docsDao.get(input.docId);
      if (doc === undefined) {
        return errResult(makeError('not_found', `Doc not found: ${input.docId}`));
      }
      const now = new Date().toISOString();
      ctx.store.docsDao.upsert({
        ...doc,
        title: input.title ?? doc.title,
        updatedAt: now,
      });
      ctx.settings.set(docBodyKey(input.docId), input.body);
      return okResult({ id: input.docId, updatedAt: now });
    },

    syncRepos: () => {
      const jobId = `docs-sync-${Date.now()}`;
      ctx.eventBus.emit('toast', { level: 'info', message: 'Docs repo sync queued' });
      return okResult({ jobId });
    },

    listDrafts: () => {
      const docs = ctx.store.docsDao.list();
      const drafts = docs
        .filter((d) => ctx.settings.get(`${DOC_STATUS_PREFIX}${d.id}`) === 'draft')
        .map((d) => ({
          id: d.id,
          title: d.title,
          group: (ctx.settings.get(`${DOC_GROUP_PREFIX}${d.id}`) as string | undefined) ?? 'general',
        }));
      return okResult({ drafts });
    },
  };
}
