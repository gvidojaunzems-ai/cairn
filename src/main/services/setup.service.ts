/**
 * `setup.*` service — first-run bootstrap state.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

export interface SetupService {
  getState(): CoreServiceResult<{ complete: boolean; step: string; peopleCount: number; pct?: number; running?: boolean }>;
  run(_input?: { step?: string }): CoreServiceResult<{ jobId: string }>;
  cancel(): CoreServiceResult<{ cancelled: boolean }>;
}

export function createSetupService(ctx: ServiceContext): SetupService {
  return {
    getState: () => {
      const state = ctx.setupOrchestrator.getState();
      return okResult({
        complete: state.complete,
        step: state.step,
        peopleCount: state.peopleCount,
        pct: state.pct,
        running: state.running,
      });
    },
    run: () => okResult(ctx.setupOrchestrator.run()),
    cancel: () => {
      ctx.setupOrchestrator.cancel();
      return okResult({ cancelled: true });
    },
  };
}
