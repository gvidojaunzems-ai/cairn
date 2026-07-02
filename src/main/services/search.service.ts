/**
 * `search.*` service — knowledge-base search stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface SearchService {
  query(input: { q: string }): CoreServiceResult<never>;
}

export const searchService: SearchService = {
  query: (_input) => notImplementedResult('search.query'),
};
