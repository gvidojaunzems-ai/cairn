/**
 * `news.*` service — news feed stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface NewsService {
  list(): CoreServiceResult<never>;
  refresh(): CoreServiceResult<never>;
}

export const newsService: NewsService = {
  list: () => notImplementedResult('news.list'),
  refresh: () => notImplementedResult('news.refresh'),
};
