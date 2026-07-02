/**
 * `system.*` service — the only namespace with a real (non-stub)
 * response. `getStatus` must round-trip in under 100 ms cold (S1) so it
 * takes on no heavy dependencies.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { API_VERSION } from '../../shared/ipc/api-version.js';
import type { SystemStatus } from '../../shared/ipc/operations.js';
import { okResult } from '../ipc/errors.js';

/** Public shape of the system service. */
export interface SystemService {
  getStatus(): CoreServiceResult<SystemStatus>;
  getApiVersion(): CoreServiceResult<{ apiVersion: string }>;
}

export const systemService: SystemService = {
  getStatus: (): CoreServiceResult<SystemStatus> => okResult({ ready: true }),
  getApiVersion: (): CoreServiceResult<{ apiVersion: string }> =>
    okResult({ apiVersion: API_VERSION }),
};
