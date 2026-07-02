/**
 * `settings.*` service — user-settings stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface SettingsService {
  get(): CoreServiceResult<never>;
  set(input: { key: string; value: unknown }): CoreServiceResult<never>;
}

export const settingsService: SettingsService = {
  get: () => notImplementedResult('settings.get'),
  set: (_input) => notImplementedResult('settings.set'),
};
