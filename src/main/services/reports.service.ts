/**
 * `reports.*` service — report templates and generation.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

const REPORT_BODY_PREFIX = 'report:body:';

export interface ReportsService {
  templates(): CoreServiceResult<{ templates: { id: string; name: string; description: string }[] }>;
  generate(input: { kind: string; external?: boolean }): CoreServiceResult<{ reportId: string; preview: string }>;
  export(input: { reportId: string; format: 'md' | 'docx' | 'pdf' }): CoreServiceResult<{ path: string; format: string }>;
  pushToRepo(input: { reportId: string }): CoreServiceResult<{ pushed: boolean }>;
}

export function createReportsService(ctx: ServiceContext): ReportsService {
  return {
    templates: () =>
      okResult({
        templates: [
          { id: 'weekly-status', name: 'Weekly status', description: 'Squad PoC status rollup' },
          { id: 'poc-retro', name: 'PoC retro', description: 'Retrospective for a completed PoC' },
          { id: 'standup-summary', name: 'Standup summary', description: "Today's standup digest" },
        ],
      }),

    generate: (input) => {
      if (input.external === true) {
        return errResult(makeError('unavailable', 'External report generation is not configured.'));
      }
      const projects = ctx.store.projectsDao.list();
      const reportId = `report-${Date.now()}`;
      const preview = `# ${input.kind}\n\nActive PoCs: ${projects.length}\n\nGenerated locally at ${new Date().toISOString()}`;
      const now = new Date().toISOString();
      ctx.store.db
        .prepare(
          `INSERT INTO reports (id, project_id, title, content, created_at, updated_at)
           VALUES (@id, NULL, @title, @content, @ts, @ts)`,
        )
        .run({ id: reportId, title: input.kind, content: preview, ts: now });
      ctx.settings.set(`${REPORT_BODY_PREFIX}${reportId}`, preview);
      return okResult({ reportId, preview });
    },

    export: (input) => {
      const row = ctx.store.db
        .prepare('SELECT id, content FROM reports WHERE id = ?')
        .get(input.reportId) as { id: string; content: string } | undefined;
      if (row === undefined) {
        const stored = ctx.settings.get(`${REPORT_BODY_PREFIX}${input.reportId}`);
        if (stored === undefined) {
          return errResult(makeError('not_found', `Report not found: ${input.reportId}`));
        }
      }
      const path = `exports/${input.reportId}.${input.format}`;
      return okResult({ path, format: input.format });
    },

    pushToRepo: (input) => {
      const row = ctx.store.db
        .prepare('SELECT id FROM reports WHERE id = ?')
        .get(input.reportId) as { id: string } | undefined;
      if (row === undefined) {
        return errResult(makeError('not_found', `Report not found: ${input.reportId}`));
      }
      ctx.eventBus.emit('sync.updated', { entityTypes: ['reports'], at: new Date().toISOString() });
      return okResult({ pushed: true });
    },
  };
}
