/**
 * News-item fixtures — S7 requires >= 1 row.
 */
import type { NewsItem } from '../../../contracts/domain-model.contract.js';

import { FIXTURE_TIMESTAMP } from './people.js';

export const NEWS_ITEM_FIXTURES: readonly NewsItem[] = [
  {
    id: 'news-1',
    source: 'internal',
    title: 'Cairn foundation lands',
    body: 'The foundation scaffold ships with the data layer stubbed and native modules smoke-tested.',
    publishedAt: FIXTURE_TIMESTAMP,
    ingestedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'news-2',
    source: 'rss',
    title: 'sqlite-vec 0.1.6 release notes',
    url: 'https://alexgarcia.xyz/sqlite-vec/',
    body: 'vec0 virtual table gains metadata-filter improvements.',
    publishedAt: FIXTURE_TIMESTAMP,
    ingestedAt: FIXTURE_TIMESTAMP,
  },
] as const;
