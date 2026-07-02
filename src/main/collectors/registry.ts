/**
 * Collector registry — team-sync, wip-signals, news collectors.
 */
import type Database from 'better-sqlite3';

import type { EventBus } from '../ipc/event-bus.js';
import type { FeedsDao } from '../db/dao/feeds.js';
import type { NewsItemsDao } from '../db/dao/news-items.js';
import type { LocalReposDao } from '../db/dao/local-repos.js';
import type { WipSignalsDao } from '../db/dao/wip-signals.js';
import type { AiEngine } from '../engines/ai-engine.js';
import { createTeamRepoEngine, type TeamRepoEngine } from '../engines/team-repo-engine.js';

export interface CollectorContext {
  db: Database.Database;
  eventBus: EventBus;
  teamRepo: TeamRepoEngine;
  aiEngine: AiEngine;
  localReposDao?: LocalReposDao;
  wipSignalsDao?: WipSignalsDao;
  newsItemsDao?: NewsItemsDao;
  feedsDao?: FeedsDao;
}

export interface CollectorResult {
  ok: boolean;
  message: string;
}

export type CollectorFn = (ctx: CollectorContext) => Promise<CollectorResult>;

export async function runTeamSyncCollector(ctx: CollectorContext): Promise<CollectorResult> {
  const state = ctx.teamRepo.pull();
  ctx.eventBus.emit('sync.updated', {
    entityTypes: ['projects', 'signals', 'updates'],
    at: new Date().toISOString(),
  });
  return { ok: true, message: `Team sync: ${state.status}` };
}

export async function runWipSignalsCollector(ctx: CollectorContext): Promise<CollectorResult> {
  const repos = ctx.localReposDao?.list() ?? [];
  let emitted = 0;
  const handle = 'local-dev';
  const today = new Date().toISOString();

  for (const repo of repos) {
    const scanned = ctx.teamRepo.scanLocalRepo(repo.id);
    if (scanned === null) continue;

    let summary = `Working on ${scanned.branch} with ${String(scanned.ahead)} unpushed commit(s).`;
    if (scanned.dirty) {
      summary = `${summary} Uncommitted local changes present.`;
    }

    const aiResult = await ctx.aiEngine.complete({
      prompt: `Summarize WIP in one sentence (no code): branch=${scanned.branch}, ahead=${String(scanned.ahead)}, dirty=${String(scanned.dirty)}`,
      taskType: 'diff.summary',
    });
    if (aiResult.ok) {
      summary = aiResult.data.text.slice(0, 300);
    }

    ctx.teamRepo.writeSignal(
      {
        schema_version: 1,
        person: handle,
        ts: today,
        project: repo.name,
        branch: scanned.branch,
        ahead_local: scanned.ahead,
        ahead_pushed: 0,
        files_touched: [],
        last_active: today,
        unpushed_days: scanned.ahead > 0 ? 1 : 0,
        summary,
      },
      handle,
    );

    ctx.wipSignalsDao?.upsert({
      id: `signal-${repo.id}-${today.slice(0, 10)}`,
      entityId: repo.id,
      entityType: 'local_repo',
      summary,
      status: 'active',
      source: scanned.branch,
      createdAt: today,
      updatedAt: today,
    });
    emitted += 1;
  }

  if (emitted > 0) {
    ctx.eventBus.emit('signals.updated', { date: today.slice(0, 10) });
  }
  return { ok: true, message: `Emitted ${String(emitted)} WIP signal(s)` };
}

export async function runNewsCollector(ctx: CollectorContext): Promise<CollectorResult> {
  const feeds = ctx.feedsDao?.list(true) ?? [];
  let count = 0;
  const ts = new Date().toISOString();

  for (const feed of feeds) {
    ctx.newsItemsDao?.upsert({
      id: `news-${feed.id}-${Date.now().toString(36)}`,
      topicId: null,
      title: `Digest from ${feed.name}`,
      summary: `Latest items from ${feed.url} (offline template).`,
      url: feed.url,
      source: feed.name,
      publishedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    });
    ctx.feedsDao?.upsert({ ...feed, lastFetchedAt: ts });
    count += 1;
  }

  if (count === 0 && ctx.newsItemsDao !== undefined) {
    ctx.newsItemsDao.upsert({
      id: `news-local-${Date.now().toString(36)}`,
      topicId: null,
      title: 'Local AI tooling roundup',
      summary: 'Vector DBs, local LLM runtimes, and squad tooling updates.',
      url: null,
      source: 'cairn-collector',
      publishedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    });
    count = 1;
  }

  ctx.eventBus.emit('news.updated', { count });
  return { ok: true, message: `Ingested ${String(count)} news item(s)` };
}

export const COLLECTOR_REGISTRY: Record<string, CollectorFn> = {
  'team-sync': runTeamSyncCollector,
  'wip-signals': runWipSignalsCollector,
  news: runNewsCollector,
};

export function createDefaultCollectorContext(
  db: Database.Database,
  eventBus: EventBus,
  aiEngine: AiEngine,
  daos: {
    localReposDao?: LocalReposDao;
    wipSignalsDao?: WipSignalsDao;
    newsItemsDao?: NewsItemsDao;
    feedsDao?: FeedsDao;
  } = {},
): CollectorContext {
  return {
    db,
    eventBus,
    aiEngine,
    teamRepo: createTeamRepoEngine({ db, ...daos }),
    ...daos,
  };
}
