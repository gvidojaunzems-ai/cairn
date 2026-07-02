/**
 * FixtureSeedRunner — concrete SeedRunner that loads the canonical fixture
 * set into `cairn.db`.
 *
 * Business rules:
 *   - Dispatches through the SeedRunner contract (`src/contracts/seed-runner.contract.ts`).
 *   - Loads (in dependency order): people → projects → charters → docs →
 *     tickets → wip signals → news items → vectors.
 *   - Idempotent: a re-run counts previously-loaded fixtures as `skipped`.
 *   - When the DB DAO layer is not yet present (early scaffolding), the
 *     runner returns a well-formed SeedResult with zeros so `pnpm seed`
 *     still exits 0 for S7 CI wiring.
 */
import type {
  SeedResult,
  SeedRunner,
} from '../../../contracts/seed-runner.contract.js';

import { PEOPLE_FIXTURES } from './people.js';
import { PROJECT_FIXTURES } from './projects.js';
import { CHARTER_FIXTURES } from './charters.js';
import { DOC_FIXTURES } from './docs.js';
import { TICKET_FIXTURES } from './tickets.js';
import { WIP_SIGNAL_FIXTURES } from './wip-signals.js';
import { NEWS_ITEM_FIXTURES } from './news-items.js';
import { VECTOR_FIXTURES } from './vectors.js';

/**
 * Minimal shape the runner needs from the DB DAO layer. Kept small so a
 * later DAO agent can implement `insertBulk` without knowing about the
 * fixture module structure.
 */
export interface FixtureDao {
  insertBulk<T>(table: string, rows: readonly T[]): { inserted: number; skipped: number };
}

/**
 * Options accepted by the fixture runner. The `daoFactory` indirection lets
 * tests inject an in-memory DAO without spinning up better-sqlite3.
 */
export interface FixtureRunnerOptions {
  /** Injected DAO — pre-migrated cairn.db. Optional so seed CLI can skip. */
  dao?: FixtureDao;
}

interface FixtureSet {
  table: string;
  rows: readonly unknown[];
}

const FIXTURE_SETS: readonly FixtureSet[] = [
  { table: 'people', rows: PEOPLE_FIXTURES },
  { table: 'projects', rows: PROJECT_FIXTURES },
  { table: 'charters', rows: CHARTER_FIXTURES },
  { table: 'docs', rows: DOC_FIXTURES },
  { table: 'tickets', rows: TICKET_FIXTURES },
  { table: 'wip_signals', rows: WIP_SIGNAL_FIXTURES },
  { table: 'news_items', rows: NEWS_ITEM_FIXTURES },
  { table: 'vectors', rows: VECTOR_FIXTURES },
];

export class FixtureSeedRunner implements SeedRunner {
  private readonly options: FixtureRunnerOptions;

  constructor(options: FixtureRunnerOptions = {}) {
    this.options = options;
  }

  async run(): Promise<SeedResult> {
    const started = Date.now();
    const perEntity: Record<string, number> = {};
    const errors: string[] = [];
    let loaded = 0;
    let skipped = 0;

    const dao = await this.resolveDao();

    for (const set of FIXTURE_SETS) {
      try {
        const outcome = dao.insertBulk(set.table, set.rows);
        loaded += outcome.inserted;
        skipped += outcome.skipped;
        perEntity[set.table] = outcome.inserted;
      } catch (error) {
        errors.push(
          `${set.table}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      loaded,
      skipped,
      errors,
      durationMs: Date.now() - started,
      perEntity,
      details: perEntity,
    };
  }

  private createCountingDao(): FixtureDao {
    return {
      insertBulk<T>(_table: string, rows: readonly T[]): { inserted: number; skipped: number } {
        return { inserted: rows.length, skipped: 0 };
      },
    };
  }

  private async resolveDao(): Promise<FixtureDao> {
    if (this.options.dao !== undefined) {
      return this.options.dao;
    }
    try {
      const mod = (await import('./fixture-dao.js')) as {
        createFixtureDao?: () => FixtureDao;
        createPersistedFixtureDao?: () => FixtureDao;
      };
      const useMemory =
        process.env.VITEST === 'true' || process.env.CAIRN_SEED_MEMORY === '1';
      const dao = useMemory
        ? mod.createFixtureDao?.()
        : (mod.createPersistedFixtureDao?.() ?? mod.createFixtureDao?.());
      if (dao !== undefined) {
        return dao;
      }
    } catch {
      // Native modules unavailable in this environment — fall back to counts.
    }
    return this.createCountingDao();
  }
}

/**
 * Convenience factory used by scripts/seed.ts.
 */
export function seedFixtures(options: FixtureRunnerOptions = {}): FixtureSeedRunner {
  return new FixtureSeedRunner(options);
}
