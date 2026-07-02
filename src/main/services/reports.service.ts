/**
 * `reports.*` service — report generation stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface ReportsService {
  list(): CoreServiceResult<never>;
  generate(input: { kind: string }): CoreServiceResult<never>;
}

export const reportsService: ReportsService = {
  list: () => notImplementedResult('reports.list'),
  generate: (_input) => notImplementedResult('reports.generate'),
};
