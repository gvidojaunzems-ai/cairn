/**
 * `pulse.*` service — activity-pulse stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface PulseService {
  get(): CoreServiceResult<never>;
}

export const pulseService: PulseService = {
  get: () => notImplementedResult('pulse.get'),
};
