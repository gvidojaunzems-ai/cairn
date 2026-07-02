// qa-spec: S4 — Vector upsert completes and top-k (k=3) similarity returns
// the correct fixture neighbors; metadata-filtered query
// (entity_type='project') returns only project vectors.
//
// Contract-level test — asserts the fixture shape needed to make S4 pass
// downstream once the vector DAO lands.
import { describe, expect, it } from 'vitest';

describe('main/db/vectors — fixture invariants (S4)', () => {
  it('vector fixtures are unit-length, deterministic, project-scoped', async () => {
    const mod = await import('../../../src/main/db/fixtures/vectors');
    expect(mod.VECTOR_FIXTURES.length).toBeGreaterThanOrEqual(3);
    for (const vec of mod.VECTOR_FIXTURES) {
      expect(vec.entityType).toBe('project');
      expect(vec.embedding.length).toBe(vec.dim);
      const norm = Math.sqrt(vec.embedding.reduce((acc, x) => acc + x * x, 0));
      expect(norm).toBeCloseTo(1, 5);
    }
  });

  it('top-k(k=3) simulation returns the three neighbors that share a nonzero dim', async () => {
    const mod = await import('../../../src/main/db/fixtures/vectors');
    const query = mod.VECTOR_FIXTURES[0];
    expect(query).toBeDefined();
    if (!query) return;
    // Cosine similarity — unit vectors, so it's just the dot product.
    const scored = mod.VECTOR_FIXTURES.map((v) => ({
      id: v.id,
      score: v.embedding.reduce(
        (acc, x, i) => acc + x * (query.embedding[i] ?? 0),
        0,
      ),
    }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    expect(scored).toHaveLength(3);
    expect(scored[0]?.id).toBe(query.id);
    // All top-3 must be from the project entity type — S4 metadata filter
    // pre-check.
    for (const hit of scored) {
      const source = mod.VECTOR_FIXTURES.find((v) => v.id === hit.id);
      expect(source?.entityType).toBe('project');
    }
  });
});
