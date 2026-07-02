/**
 * `docs.*` service — internal-docs stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface DocsService {
  list(): CoreServiceResult<never>;
  get(input: { docId: string }): CoreServiceResult<never>;
}

export const docsService: DocsService = {
  list: () => notImplementedResult('docs.list'),
  get: (_input) => notImplementedResult('docs.get'),
};
