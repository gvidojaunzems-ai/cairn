/**
 * Job kind → runner registry.
 */
import { createSettingsKvDao } from '../db/dao/settings-kv.js';
import { openStore } from '../db/store.js';
import { createAiEngine } from '../engines/ai-engine.js';
import { createSearchEngine } from '../engines/search-engine.js';
import { SETUP_JOB_KIND, runSetupBootstrapJob } from '../engines/setup-orchestrator.js';
import { createEventBus } from '../ipc/event-bus.js';
import {
  runSampleLongJob,
  type SampleLongJobCallbacks,
  type SampleLongJobOptions,
} from './sample-long-job.js';

export interface JobRunnerCallbacks {
  onProgress(pct: number, label: string): void;
  isCancelled(): boolean;
}

export type JobRunner = (
  input: unknown,
  callbacks: JobRunnerCallbacks,
) => Promise<unknown>;

export const JOB_RUNNERS: Readonly<Record<string, JobRunner>> = {
  'sample-long-job': async (input: unknown, callbacks: JobRunnerCallbacks): Promise<unknown> => {
    const opts = (input ?? {}) as SampleLongJobOptions;
    const cbs: SampleLongJobCallbacks = {
      onProgress: callbacks.onProgress,
      isCancelled: callbacks.isCancelled,
    };
    return runSampleLongJob(opts, cbs);
  },

  [SETUP_JOB_KIND]: async (_input, callbacks) => {
    const store = openStore();
    try {
      const settings = createSettingsKvDao(store.db);
      const eventBus = createEventBus({ getWebContents: () => [] });
      return await runSetupBootstrapJob(store.db, settings, eventBus, {
        onProgress: callbacks.onProgress,
        isCancelled: callbacks.isCancelled,
      });
    } finally {
      store.close();
    }
  },

  'search.rebuildAll': async (_input, callbacks) => {
    const store = openStore();
    try {
      const settings = createSettingsKvDao(store.db);
      const aiEngine = createAiEngine({ db: store.db, settings });
      const searchEngine = createSearchEngine({
        docsDao: store.docsDao,
        projectsDao: store.projectsDao,
        knowledgeItemsDao: store.knowledgeItemsDao,
        vectorsDao: store.vectorsDao,
        aiEngine,
      });
      const indexed = await searchEngine.rebuildAll(callbacks.onProgress);
      return { indexed };
    } finally {
      store.close();
    }
  },
};

export function getJobRunner(kind: string): JobRunner | undefined {
  return JOB_RUNNERS[kind];
}
