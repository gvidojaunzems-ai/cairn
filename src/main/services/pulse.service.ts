/**
 * `pulse.*` service — team pulse and weekly digest.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

export interface PulseService {
  get(): CoreServiceResult<{
    week: string;
    mood: 'steady' | 'busy' | 'stretched';
    highlights: string[];
    risks: string[];
    shipped: string[];
    stalled: string[];
  }>;
  generateWeeklyDigest(): CoreServiceResult<{ jobId: string }>;
}

export function createPulseService(ctx: ServiceContext): PulseService {
  return {
    get: () => {
      const projects = ctx.store.projectsDao.list();
      const active = projects.filter((p) => p.status === 'active');
      const paused = projects.filter((p) => p.status === 'paused');
      return okResult({
        week: new Date().toISOString().slice(0, 10),
        mood: paused.length > 2 ? 'stretched' : 'steady',
        highlights: active.slice(0, 3).map((p) => `${p.name} progressing on schedule`),
        risks: paused.map((p) => `${p.name} paused — needs owner check-in`),
        shipped: projects.filter((p) => p.status === 'completed').map((p) => p.name),
        stalled: paused.map((p) => p.name),
      });
    },

    generateWeeklyDigest: () => {
      const jobId = `pulse-digest-${Date.now()}`;
      ctx.eventBus.emit('toast', { level: 'info', message: 'Weekly digest generation queued' });
      return okResult({ jobId });
    },
  };
}
