// qa-spec: S7 — `pnpm seed` (via scripts/seed.ts) populates the realistic
// fixture dataset. Row-count assertions live here so they stay decoupled
// from the stub-runner shape tests in tests/scripts/seed.test.ts.
//
// These assertions run against the seed module's own reporting surface —
// after `pnpm seed` the `SeedResult` MUST reflect the loaded rows (the
// concrete SeedRunner reports `loaded > 0`) and per-entity totals must be
// exposed on a `SeedResult.details` map so the CI parser can verify counts
// without opening cairn.db.
//
// A separate DB-level integrity assertion lives in
// tests/main/db/seed-integrity.test.ts (native-modules gated).
import { describe, expect, it } from 'vitest';

describe('scripts/seed — realistic fixture dataset (S7)', () => {
  // qa-spec: S7
  it('exports a real SeedRunner (not the no-op stub) with a run() that returns loaded>0', async () => {
    const mod = (await import('../../scripts/seed')) as {
      seedRunner?: { run: () => Promise<{ loaded: number; errors: string[] }> };
      stubRunner?: { run: () => Promise<{ loaded: number; errors: string[] }> };
    };
    // Prefer the named `seedRunner` export (the real one). Fall back to the
    // stub only so the failure message is descriptive when the module still
    // exposes just the stub.
    const runner = mod.seedRunner ?? mod.stubRunner;
    expect(runner, 'scripts/seed.ts must export a SeedRunner (named "seedRunner" preferred)').toBeDefined();
    if (runner === undefined) return;
    const result = await runner.run();
    expect(
      result.errors,
      `seed runner reported errors: ${result.errors.join('; ')}`,
    ).toEqual([]);
    expect(
      result.loaded,
      'S7 requires the seed run to load a non-empty fixture set (people + projects + charter + news + docs + tickets + WIP signals)',
    ).toBeGreaterThan(0);
  });

  // qa-spec: S7
  it('main() emits a SeedResult with structured details covering every fixture entity', async () => {
    const mod = (await import('../../scripts/seed')) as {
      main: (
        runner?: { run: () => Promise<unknown> },
      ) => Promise<{
        loaded: number;
        errors: string[];
        details?: Record<string, number>;
      }>;
    };
    const buffer: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      buffer.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as typeof process.stdout.write;
    try {
      const result = await mod.main();
      // S7 requires people=5, projects>=6, news_items>=1, docs>=1, tickets>=1,
      // wip_signals>=1, and a non-empty charter for poc-vector-search.
      expect(result.details, 'main() must attach per-entity counts to the SeedResult').toBeDefined();
      const details = result.details ?? {};
      expect(details.people, 'expected exactly 5 seeded people (Gvido, Lars, Maria, Priya, Tom)').toBe(5);
      expect(details.projects, 'expected >= 6 seeded PoC projects').toBeGreaterThanOrEqual(6);
      expect(details.news_items, 'expected >= 1 seeded news_items').toBeGreaterThanOrEqual(1);
      expect(details.docs, 'expected >= 1 seeded docs').toBeGreaterThanOrEqual(1);
      expect(details.tickets, 'expected >= 1 seeded tickets').toBeGreaterThanOrEqual(1);
      expect(details.wip_signals, 'expected >= 1 seeded WIP signals').toBeGreaterThanOrEqual(1);
      expect(details.charters, 'expected >= 1 seeded charter (poc-vector-search)').toBeGreaterThanOrEqual(1);
      // Log line should carry the JSON summary (unchanged from the stub contract).
      expect(buffer.join('')).toContain('"loaded"');
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
