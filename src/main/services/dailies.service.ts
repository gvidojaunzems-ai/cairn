/**
 * `dailies.*` service — daily note stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface DailiesService {
  list(): CoreServiceResult<never>;
  create(input: { date: string }): CoreServiceResult<never>;
}

export const dailiesService: DailiesService = {
  list: () => notImplementedResult('dailies.list'),
  create: (_input) => notImplementedResult('dailies.create'),
};
