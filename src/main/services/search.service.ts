/**
 * `search.*` service — hybrid search and askDocs RAG.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

export interface SearchService {
  query(input: { q: string; limit?: number }): CoreServiceResult<{
    hits: { id: string; title: string; snippet: string; score: number; entityType: string }[];
  }>;
  askDocs(input: { q: string; docIds?: string[] }): Promise<CoreServiceResult<{ answer: string; sources: unknown[] }>>;
}

export function createSearchService(ctx: ServiceContext): SearchService {
  return {
    query: (input) => okResult({ hits: ctx.searchEngine.query(input.q, input.limit ?? 20) }),
    askDocs: async (input) => {
      const result = await ctx.searchEngine.askDocs(input.q);
      return okResult({ answer: result.answer, sources: result.sources });
    },
  };
}
