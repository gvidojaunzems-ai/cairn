/**
 * `news.*` service — AI news feed and knowledge items.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

export interface NewsService {
  listFeed(input: { topic?: string; source?: string }): CoreServiceResult<{
    items: {
      id: string;
      title: string;
      summary: string | null;
      url: string | null;
      source: string | null;
      publishedAt: string | null;
    }[];
  }>;
  getItem(input: { itemId: string }): CoreServiceResult<{
    id: string;
    title: string;
    summary: string | null;
    url: string | null;
    source: string | null;
    publishedAt: string | null;
  }>;
  save(input: { itemId: string }): CoreServiceResult<{ saved: boolean; knowledgeId: string }>;
  listKnowledge(): CoreServiceResult<{
    items: { id: string; type: string; content: string; source: string | null }[];
  }>;
}

export function createNewsService(ctx: ServiceContext): NewsService {
  return {
    listFeed: (input) => {
      let items = ctx.store.newsItemsDao.list();
      if (input.topic !== undefined) {
        items = items.filter((n) => n.topicId === input.topic);
      }
      if (input.source !== undefined) {
        items = items.filter((n) => n.source === input.source);
      }
      return okResult({
        items: items.map((n) => ({
          id: n.id,
          title: n.title,
          summary: n.summary ?? null,
          url: n.url ?? null,
          source: n.source ?? null,
          publishedAt: n.publishedAt ?? null,
        })),
      });
    },

    getItem: (input) => {
      const item = ctx.store.newsItemsDao.get(input.itemId);
      if (item === undefined) {
        return errResult(makeError('not_found', `News item not found: ${input.itemId}`));
      }
      return okResult({
        id: item.id,
        title: item.title,
        summary: item.summary ?? null,
        url: item.url ?? null,
        source: item.source ?? null,
        publishedAt: item.publishedAt ?? null,
      });
    },

    save: (input) => {
      const item = ctx.store.newsItemsDao.get(input.itemId);
      if (item === undefined) {
        return errResult(makeError('not_found', `News item not found: ${input.itemId}`));
      }
      const now = new Date().toISOString();
      const knowledgeId = `knowledge-news-${item.id}`;
      ctx.store.knowledgeItemsDao.upsert({
        id: knowledgeId,
        type: 'news',
        content: `${item.title}\n\n${item.summary ?? ''}`,
        source: item.source ?? 'news-feed',
        createdAt: now,
        updatedAt: now,
      });
      return okResult({ saved: true, knowledgeId });
    },

    listKnowledge: () => {
      const items = ctx.store.knowledgeItemsDao.list();
      return okResult({
        items: items.map((k) => ({
          id: k.id,
          type: k.type,
          content: k.content,
          source: k.source ?? null,
        })),
      });
    },
  };
}
