/**
 * SeedRunner contract.
 *
 * DO NOT MODIFY EXPORTS WITHOUT A VERSIONING ADR.
 *
 * Business rules:
 *   - The seed script (`scripts/seed.ts`) is a thin CLI over `SeedRunner`.
 *     Concrete seed implementations land in later tasks — the contract lets
 *     them plug in without a code change in the CLI.
 *   - `SeedResult` fields are conservative: `loaded` and `skipped` capture the
 *     two positive-path outcomes; `errors` captures partial failures without
 *     forcing a global throw; `durationMs` supports lightweight regression
 *     monitoring during local development.
 */

/**
 * Structured summary emitted at the end of a seed run.
 */
export interface SeedResult {
  /** Number of records newly loaded. */
  loaded: number;
  /** Number of records skipped (already present or filtered). */
  skipped: number;
  /** Per-record errors that did not abort the whole run. */
  errors: string[];
  /** Wall-clock duration of the run in milliseconds. */
  durationMs: number;
}

/**
 * Pluggable seed runner. Later tasks provide concrete implementations
 * (fixture loader, demo-data generator, benchmark seeder, etc.).
 */
export interface SeedRunner {
  run(): Promise<SeedResult>;
}
