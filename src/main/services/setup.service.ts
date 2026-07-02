/**
 * `setup.*` service — first-run onboarding flow. Stubbed until Cairn
 * Build Spec 03 lands.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface SetupService {
  getState(): CoreServiceResult<never>;
  complete(): CoreServiceResult<never>;
}

export const setupService: SetupService = {
  getState: () => notImplementedResult('setup.getState'),
  complete: () => notImplementedResult('setup.complete'),
};
