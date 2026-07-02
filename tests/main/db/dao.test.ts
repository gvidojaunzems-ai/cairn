// qa-spec: S3 — All DAO CRUD/query tests pass with 0 failures.
// Contract-level test for the DAO tree. Focus is the fixture data — the
// concrete DAO implementations (src/main/db/dao/**) load from these
// fixtures once the DB agent's work lands.
import { describe, expect, it } from 'vitest';

describe('main/db/dao — fixture rows (S3)', () => {
  it('people fixtures export exactly 5 named rows', async () => {
    const mod = await import('../../../src/main/db/fixtures/people');
    expect(mod.PEOPLE_FIXTURES).toHaveLength(5);
    const names = mod.PEOPLE_FIXTURES.map((p) => p.name).sort();
    expect(names).toEqual(['Gvido', 'Lars', 'Maria', 'Priya', 'Tom']);
  });

  it('project fixtures include exactly 6 PoC projects', async () => {
    const mod = await import('../../../src/main/db/fixtures/projects');
    expect(mod.PROJECT_FIXTURES).toHaveLength(6);
  });

  it('poc-vector-search fixture has a non-empty charter body', async () => {
    const mod = await import('../../../src/main/db/fixtures/charters');
    const charter = mod.CHARTER_FIXTURES.find(
      (c) => c.projectId === 'project-poc-vector-search',
    );
    expect(charter).toBeDefined();
    expect(charter?.body.trim().length).toBeGreaterThan(0);
  });

  it('fixture entities carry ISO timestamps', async () => {
    const mod = await import('../../../src/main/db/fixtures/people');
    for (const person of mod.PEOPLE_FIXTURES) {
      expect(person.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
  });
});
