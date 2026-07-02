/**
 * Shared dependency bundle for main-process services.
 */
import { seedPersistedDatabase } from '../db/fixtures/fixture-dao.js';
import { createSettingsKvDao, type SettingsKvDao } from '../db/dao/settings-kv.js';
import { openStore, type LocalStoreHandle } from '../db/store.js';
import { createAiEngine, type AiEngine } from '../engines/ai-engine.js';
import { createMeetingEngine, type MeetingEngine } from '../engines/meeting-engine.js';
import { createSearchEngine, type SearchEngine } from '../engines/search-engine.js';
import { createSetupOrchestrator, type SetupOrchestrator } from '../engines/setup-orchestrator.js';
import { createTeamRepoEngine, type TeamRepoEngine } from '../engines/team-repo-engine.js';
import type { EventBus } from '../ipc/event-bus.js';

export interface ServiceContext {
  store: LocalStoreHandle;
  settings: SettingsKvDao;
  eventBus: EventBus;
  aiEngine: AiEngine;
  teamRepoEngine: TeamRepoEngine;
  searchEngine: SearchEngine;
  meetingEngine: MeetingEngine;
  setupOrchestrator: SetupOrchestrator;
}

let cached: ServiceContext | undefined;

function seedIfEmpty(store: LocalStoreHandle): void {
  const count = store.db.prepare('SELECT COUNT(*) AS c FROM people').get() as { c: number };
  if (count.c === 0) {
    seedPersistedDatabase(store.db);
  }
}

export function createServiceContext(
  store: LocalStoreHandle,
  eventBus: EventBus,
  jobHooks?: {
    startJob: (kind: string, input?: unknown) => { jobId: string };
    cancelJob: (jobId: string) => void;
  },
): ServiceContext {
  seedIfEmpty(store);
  const settings = createSettingsKvDao(store.db);

  const aiEngine = createAiEngine({
    db: store.db,
    settings,
    onBudgetUpdated: (budget) => {
      eventBus.emit('budget.updated', { used: budget.used, cap: budget.cap });
    },
  });

  const teamRepoEngine = createTeamRepoEngine({
    db: store.db,
    localReposDao: store.localReposDao,
    projectsDao: store.projectsDao,
    wipSignalsDao: store.wipSignalsDao,
    reconcile: {
      onSyncUpdated: (entityTypes) => {
        eventBus.emit('sync.updated', { entityTypes, at: new Date().toISOString() });
      },
    },
  });

  const searchEngine = createSearchEngine({
    docsDao: store.docsDao,
    projectsDao: store.projectsDao,
    knowledgeItemsDao: store.knowledgeItemsDao,
    vectorsDao: store.vectorsDao,
    aiEngine,
  });

  const meetingEngine = createMeetingEngine({
    meetingsDao: store.meetingsDao,
    aiEngine,
    eventBus,
  });

  const setupOrchestrator = createSetupOrchestrator({
    db: store.db,
    settings,
    eventBus,
    startJob: jobHooks?.startJob ?? (() => ({ jobId: `setup-${Date.now().toString(36)}` })),
    cancelJob: jobHooks?.cancelJob ?? (() => {}),
  });

  return {
    store,
    settings,
    eventBus,
    aiEngine,
    teamRepoEngine,
    searchEngine,
    meetingEngine,
    setupOrchestrator,
  };
}

export function getServiceContext(
  eventBus: EventBus,
  jobHooks?: {
    startJob: (kind: string, input?: unknown) => { jobId: string };
    cancelJob: (jobId: string) => void;
  },
): ServiceContext {
  if (!cached) {
    const store = openStore();
    cached = createServiceContext(store, eventBus, jobHooks);
  }
  return cached;
}

export function resetServiceContextForTests(): void {
  cached?.store.close();
  cached = undefined;
}
