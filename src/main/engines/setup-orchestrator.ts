/**
 * Setup orchestrator — 8-step first-run bootstrap with progress events.
 */
import type Database from 'better-sqlite3';

import type { SettingsKvDao } from '../db/dao/settings-kv.js';
import type { EventBus } from '../ipc/event-bus.js';
import { createTeamRepoEngine } from './team-repo-engine.js';

export interface SetupState {
  complete: boolean;
  step: string;
  pct: number;
  peopleCount: number;
  running: boolean;
  jobId?: string;
}

export interface SetupOrchestratorOptions {
  db: Database.Database;
  settings: SettingsKvDao;
  eventBus: EventBus;
  startJob: (kind: string, input?: unknown) => { jobId: string };
  cancelJob: (jobId: string) => void;
}

export interface SetupOrchestrator {
  getState(): SetupState;
  run(): { jobId: string };
  cancel(): void;
}

const STEPS = [
  { id: 'paths', label: 'Prepare data directories' },
  { id: 'team-repo', label: 'Initialize team repo' },
  { id: 'seed-people', label: 'Seed squad roster' },
  { id: 'seed-projects', label: 'Load projects from team repo' },
  { id: 'local-config', label: 'Apply local configuration' },
  { id: 'sync-pull', label: 'Pull team repo' },
  { id: 'index', label: 'Build search index' },
  { id: 'finalize', label: 'Finalize setup' },
] as const;

export const SETUP_JOB_KIND = 'setup.bootstrap';
const ACTIVE_JOB_KEY = 'setup.activeJobId';

function nowIso(): string {
  return new Date().toISOString();
}

export function createSetupOrchestrator(options: SetupOrchestratorOptions): SetupOrchestrator {
  const { db, settings, eventBus, startJob, cancelJob } = options;

  function getState(): SetupState {
    const count = db.prepare('SELECT COUNT(*) AS c FROM people').get() as { c: number };
    const complete = settings.get('setupComplete') === true;
    const activeJobId = settings.get(ACTIVE_JOB_KEY);
    const running = typeof activeJobId === 'string' && activeJobId.length > 0;
    const step = complete ? 'done' : count.c > 0 ? 'review' : running ? 'running' : 'welcome';
    return {
      complete,
      step,
      pct: complete ? 100 : running ? 50 : count.c > 0 ? 80 : 0,
      peopleCount: count.c,
      running,
      jobId: typeof activeJobId === 'string' ? activeJobId : undefined,
    };
  }

  return {
    getState,
    run: () => {
      const { jobId } = startJob(SETUP_JOB_KIND, { steps: STEPS.map((s) => s.id) });
      settings.set(ACTIVE_JOB_KEY, jobId);
      return { jobId };
    },
    cancel: () => {
      const activeJobId = settings.get(ACTIVE_JOB_KEY);
      if (typeof activeJobId === 'string') {
        cancelJob(activeJobId);
        settings.delete(ACTIVE_JOB_KEY);
      }
    },
  };
}

export async function runSetupBootstrapJob(
  db: Database.Database,
  settings: SettingsKvDao,
  eventBus: EventBus,
  callbacks: { onProgress(pct: number, label: string): void; isCancelled(): boolean },
): Promise<{ complete: boolean }> {
  const engine = createTeamRepoEngine({ db });

  for (let i = 0; i < STEPS.length; i += 1) {
    if (callbacks.isCancelled()) {
      throw new Error('cancelled');
    }
    const step = STEPS[i];
    const pct = Math.round(((i + 1) / STEPS.length) * 100);
    callbacks.onProgress(pct, step.label);
    eventBus.emit('setup.progress', { step: step.id, pct, label: step.label });

    switch (step.id) {
      case 'team-repo':
        engine.pull();
        break;
      case 'seed-people': {
        const count = db.prepare('SELECT COUNT(*) AS c FROM people').get() as { c: number };
        if (count.c === 0) {
          const ts = nowIso();
          db.prepare(
            `INSERT INTO people (id, name, role, email, status, created_at, updated_at)
             VALUES ('person-local', 'Local Dev', 'developer', NULL, 'active', @ts, @ts)`,
          ).run({ ts });
        }
        break;
      }
      case 'seed-projects':
        engine.reconcileFromDisk();
        break;
      case 'sync-pull':
        engine.pull();
        eventBus.emit('sync.updated', { entityTypes: ['projects', 'signals'], at: nowIso() });
        break;
      case 'finalize':
        settings.set('setupComplete', true);
        settings.delete(ACTIVE_JOB_KEY);
        break;
      default:
        break;
    }
  }

  return { complete: true };
}

export { STEPS };
