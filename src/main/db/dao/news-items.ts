/**
 * DAO for the `news_items` table. FK to `news_topics.id` uses SET NULL so
 * deleting a topic doesn't lose the news history.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface NewsItem extends RowMeta {
  topicId?: string | null;
  title: string;
  summary?: string | null;
  url?: string | null;
  source?: string | null;
  publishedAt?: string | null;
}

interface NewsItemRow {
  id: string;
  topic_id: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  source: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: NewsItemRow): NewsItem {
  return {
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
    summary: row.summary,
    url: row.url,
    source: row.source,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface NewsItemsDao {
  upsert(item: NewsItem): NewsItem;
  get(id: string): NewsItem | undefined;
  list(limit?: number, offset?: number): NewsItem[];
  delete(id: string): boolean;
}

export function createNewsItemsDao(db: Database.Database): NewsItemsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO news_items (id, topic_id, title, summary, url, source, published_at, created_at, updated_at)
     VALUES (@id, @topicId, @title, @summary, @url, @source, @publishedAt, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       topic_id = excluded.topic_id,
       title = excluded.title,
       summary = excluded.summary,
       url = excluded.url,
       source = excluded.source,
       published_at = excluded.published_at,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM news_items WHERE id = ?');
  const listStmt = db.prepare<[number, number]>(
    'SELECT * FROM news_items ORDER BY COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM news_items WHERE id = ?');

  return {
    upsert(item: NewsItem): NewsItem {
      const now = nowIso();
      const createdAt = item.createdAt.length > 0 ? item.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: item.id,
        topicId: item.topicId ?? null,
        title: item.title,
        summary: item.summary ?? null,
        url: item.url ?? null,
        source: item.source ?? null,
        publishedAt: item.publishedAt ?? null,
        createdAt,
        updatedAt,
      });
      return { ...item, createdAt, updatedAt };
    },
    get(id: string): NewsItem | undefined {
      const row = getStmt.get(id) as NewsItemRow | undefined;
      return row === undefined ? undefined : rowToItem(row);
    },
    list(limit = 100, offset = 0): NewsItem[] {
      return (listStmt.all(limit, offset) as NewsItemRow[]).map(rowToItem);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
