// qa-spec: (implicit — agent-plan Task 8 seed script stub)
import { describe, expect, it, vi } from 'vitest';

describe('scripts/seed — stub SeedRunner', () => {
  // implicit
  it('exports a runnable stub that resolves to a SeedResult shape', async () => {
    const mod = await import('../../scripts/seed');
    expect(mod.stubRunner).toBeDefined();
    const result = await mod.stubRunner.run();
    expect(result).toMatchObject({
      loaded: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Array),
    });
  });

  // implicit
  it('stub returns loaded=0, skipped=0, errors=[] without throwing', async () => {
    const mod = await import('../../scripts/seed');
    const result = await mod.stubRunner.run();
    expect(result.loaded).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
  });

  // implicit
  it('main() prints a JSON summary to stdout and returns the result', async () => {
    const mod = await import('../../scripts/seed');
    const writes: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as typeof process.stdout.write;
    try {
      const result = await mod.main();
      const joined = writes.join('');
      expect(joined).toContain('"loaded"');
      expect(result.errors).toEqual([]);
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
