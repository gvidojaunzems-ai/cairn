/**
 * `settings.*` service — per-user preferences and AI budget.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { okResult } from '../ipc/errors.js';
import { loadLocalConfig } from '../config/local-config.js';
import type { ServiceContext } from './service-context.js';

export interface SettingsService {
  get(): CoreServiceResult<{ local: Record<string, unknown>; kv: Record<string, unknown>; budget: { used: number; cap: number } }>;
  set(input: { key: string; value: unknown }): CoreServiceResult<{ key: string }>;
  testConnector(_input: { connector: string }): CoreServiceResult<{ ok: boolean; message: string }>;
  getBudget(): CoreServiceResult<{ used: number; cap: number }>;
}

export function createSettingsService(ctx: ServiceContext): SettingsService {
  return {
    get: () => {
      const budgetResult = ctx.aiEngine.getBudget();
      const budget = budgetResult.ok
        ? { used: budgetResult.data.used, cap: budgetResult.data.cap }
        : { used: 0, cap: 100_000 };
      return okResult({ local: loadLocalConfig(), kv: ctx.settings.list(), budget });
    },
    set: (input) => {
      ctx.settings.set(input.key, input.value);
      ctx.eventBus.emit('toast', { level: 'info', message: `Setting updated: ${input.key}` });
      return okResult({ key: input.key });
    },
    testConnector: (input) =>
      okResult({ ok: true, message: `Connector ${input.connector} check passed (offline stub).` }),
    getBudget: () => {
      const budgetResult = ctx.aiEngine.getBudget();
      if (!budgetResult.ok) return budgetResult;
      return okResult({ used: budgetResult.data.used, cap: budgetResult.data.cap });
    },
  };
}
