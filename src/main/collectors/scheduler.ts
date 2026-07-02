/**
 * Background collector scheduler — runs registered collectors on cadence.
 */
import type Database from 'better-sqlite3';

import { createSettingsKvDao } from '../db/dao/settings-kv.js';
import type { LocalStoreHandle } from '../db/store.js';
import { createAiEngine, type AiEngine } from '../engines/ai-engine.js';
import type { EventBus } from '../ipc/event-bus.js';
import {
  COLLECTOR_REGISTRY,
  createDefaultCollectorContext,
  type CollectorContext,
  type CollectorFn,
} from './registry.js';

export interface SchedulerOptions {
  db: Database.Database;
  eventBus: EventBus;
  aiEngine: AiEngine;
  collectorContext?: CollectorContext;
  intervalsMs?: Record<string, number>;
}

export interface CollectorScheduler {
  start(): void;
  stop(): void;
  runNow(name: string): Promise<void>;
  listCollectors(): string[];
}

const DEFAULT_INTERVALS: Record<string, number> = {
  'team-sync': 15 * 60 * 1000,
  'wip-signals': 30 * 60 * 1000,
  news: 60 * 60 * 1000,
};

export function createCollectorScheduler(options: SchedulerOptions): CollectorScheduler {
  const ctx = options.collectorContext ?? createDefaultCollectorContext(
    options.db,
    options.eventBus,
    options.aiEngine,
  );
  const intervals = { ...DEFAULT_INTERVALS, ...options.intervalsMs };
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  async function runCollector(name: string, fn: CollectorFn): Promise<void> {
    try {
      const result = await fn(ctx);
      if (!result.ok) {
        options.eventBus.emit('toast', { level: 'warn', message: result.message });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Collector failed';
      options.eventBus.emit('toast', { level: 'error', message: `Collector ${name}: ${message}` });
    }
  }

  return {
    start() {
      for (const [name, fn] of Object.entries(COLLECTOR_REGISTRY)) {
        const ms = intervals[name] ?? 30 * 60 * 1000;
        const timer = setInterval(() => {
          void runCollector(name, fn);
        }, ms);
        timers.set(name, timer);
      }
    },

    stop() {
      for (const timer of timers.values()) {
        clearInterval(timer);
      }
      timers.clear();
    },

    runNow: async (name) => {
      const fn = COLLECTOR_REGISTRY[name];
      if (fn === undefined) {
        throw new Error(`Unknown collector: ${name}`);
      }
      await runCollector(name, fn);
    },

    listCollectors: () => Object.keys(COLLECTOR_REGISTRY),
  };
}

export function startCollectorsScheduler(store: LocalStoreHandle, eventBus: EventBus): CollectorScheduler {
  const settings = createSettingsKvDao(store.db);
  const aiEngine = createAiEngine({ db: store.db, settings });
  const scheduler = createCollectorScheduler({
    db: store.db,
    eventBus,
    aiEngine,
    collectorContext: createDefaultCollectorContext(store.db, eventBus, aiEngine, {
      localReposDao: store.localReposDao,
      wipSignalsDao: store.wipSignalsDao,
      newsItemsDao: store.newsItemsDao,
      feedsDao: store.feedsDao,
    }),
  });
  scheduler.start();
  return scheduler;
}
