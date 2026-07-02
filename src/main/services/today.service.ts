/**
 * `today.*` service — the "today" dashboard aggregate stub.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface TodayService {
  get(): CoreServiceResult<never>;
}

export const todayService: TodayService = {
  get: () => notImplementedResult('today.get'),
};
