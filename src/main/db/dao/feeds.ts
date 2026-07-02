/**
 * DAO for the `feeds` table.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface Feed extends RowMeta {
  name: string;
  url: string;
  feedType: string;
  enabled: boolean;
  lastFetchedAt?: string | null;
}

interface FeedRow {
  id: string;
  name: string;
  url: string;
  feed_type: string;
  enabled: number;
  last_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToFeed(row: FeedRow): Feed {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    feedType: row.feed_type,
    enabled: row.enabled === 1,
    lastFetchedAt: row.last_fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface FeedsDao {
  upsert(feed: Feed): Feed;
  get(id: string): Feed | undefined;
  list(enabledOnly?: boolean): Feed[];
  delete(id: string): boolean;
}

export function createFeedsDao(db: Database.Database): FeedsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO feeds (id, name, url, feed_type, enabled, last_fetched_at, created_at, updated_at)
     VALUES (@id, @name, @url, @feedType, @enabled, @lastFetchedAt, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       url = excluded.url,
       feed_type = excluded.feed_type,
       enabled = excluded.enabled,
       last_fetched_at = excluded.last_fetched_at,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM feeds WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM feeds ORDER BY name ASC');
  const listEnabledStmt = db.prepare('SELECT * FROM feeds WHERE enabled = 1 ORDER BY name ASC');
  const deleteStmt = db.prepare<[string]>('DELETE FROM feeds WHERE id = ?');

  return {
    upsert(feed: Feed): Feed {
      const now = nowIso();
      const createdAt = feed.createdAt.length > 0 ? feed.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: feed.id,
        name: feed.name,
        url: feed.url,
        feedType: feed.feedType,
        enabled: feed.enabled ? 1 : 0,
        lastFetchedAt: feed.lastFetchedAt ?? null,
        createdAt,
        updatedAt,
      });
      return { ...feed, createdAt, updatedAt };
    },
    get(id: string): Feed | undefined {
      const row = getStmt.get(id) as FeedRow | undefined;
      return row === undefined ? undefined : rowToFeed(row);
    },
    list(enabledOnly?: boolean): Feed[] {
      const rows =
        enabledOnly === true
          ? (listEnabledStmt.all() as FeedRow[])
          : (listAllStmt.all() as FeedRow[]);
      return rows.map(rowToFeed);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
