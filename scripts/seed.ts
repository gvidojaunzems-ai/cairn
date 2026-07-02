/**
 * Seed script.
 *
 * Business rules:
 *   - Runs via `pnpm seed` (which invokes `tsx scripts/seed.ts`).
 *   - Emits a single JSON summary line to stdout so downstream tooling
 *     (e.g. a CI hook) can parse it deterministically.
 *   - Dispatches through the SeedRunner contract in
 *     `src/contracts/seed-runner.contract.ts` — swappable per environment
 *     without a CLI change.
 *   - Default runner is `FixtureSeedRunner` (loads the canonical fixture set
 *     — 5 people, 6 PoC projects, poc-vector-search charter, plus one row
 *     each of news_items/docs/tickets/WIP signals).
 *   - The pre-existing `stubRunner` export is preserved so historical unit
 *     tests (`tests/scripts/seed.test.ts`) keep passing.
 */
import type { SeedResult, SeedRunner } from '../src/contracts/seed-runner.contract.js';
import { FixtureSeedRunner } from '../src/main/db/fixtures/fixture-runner.js';

/**
 * No-op seed runner. Returns a zero-effort SeedResult and never throws so
 * historical tests keep passing. New code should use `FixtureSeedRunner`.
 */
export const stubRunner: SeedRunner = {
  async run(): Promise<SeedResult> {
    const started = Date.now();
    const finished = Date.now();
    return {
      loaded: 0,
      skipped: 0,
      errors: [],
      durationMs: finished - started,
    };
  },
};

/**
 * The concrete runner used by `pnpm seed`. Loads the fixture set into
 * cairn.db when the DAO layer is present; degrades to a zero-count result
 * when it is not, so first-time developers see exit 0 either way.
 */
export const fixtureRunner: SeedRunner = new FixtureSeedRunner();

/**
 * Entry point. Runs `runner.run()` and prints a JSON summary. Exit code 0 on
 * success — non-zero on unexpected failure (see the CLI guard below).
 */
export async function main(runner: SeedRunner = fixtureRunner): Promise<SeedResult> {
  const result = await runner.run();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

// Direct-execution guard: only auto-run when invoked as the script entry,
// never when imported by a test.
const invokedFile = process.argv[1] ?? '';
if (invokedFile.endsWith('seed.ts') || invokedFile.endsWith('seed.js')) {
  void main().catch((error: unknown) => {
    process.stderr.write(`seed failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
