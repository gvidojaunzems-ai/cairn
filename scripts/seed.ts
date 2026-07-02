/**
 * Seed script (stub).
 *
 * Business rules:
 *   - Runs via `pnpm seed` (which invokes `tsx scripts/seed.ts`).
 *   - Emits a single JSON summary line to stdout so downstream tooling
 *     (e.g. a future CI hook) can parse it deterministically.
 *   - Never touches a real database — later tasks provide concrete
 *     SeedRunner implementations. The contract lives in
 *     `src/contracts/seed-runner.contract.ts` and MUST remain stable.
 */
import type { SeedResult, SeedRunner } from '../src/contracts/seed-runner.contract.js';

/**
 * No-op seed runner. Returns a zero-effort SeedResult and never throws so
 * the smoke test (tests/scripts/seed.test.ts) has a deterministic input.
 */
export const stubRunner: SeedRunner = {
  async run(): Promise<SeedResult> {
    const started = Date.now();
    // Intentionally empty — this is a stub. Concrete seed logic lives in
    // future tasks that plug into the same `SeedRunner` contract.
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
 * Entry point. Runs `runner.run()` and prints a JSON summary. Exit code 0 on
 * success — non-zero on unexpected failure (see the CLI guard below).
 */
export async function main(runner: SeedRunner = stubRunner): Promise<SeedResult> {
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
