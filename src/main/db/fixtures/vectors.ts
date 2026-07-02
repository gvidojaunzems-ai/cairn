/**
 * Vector fixtures — one small deterministic vector per PoC project so
 * top-k tests have known neighbors. Kept low-dim (4) to keep the fixture
 * file readable; real embeddings are 384-dim.
 */
import type { Vector } from '../../../contracts/domain-model.contract.js';

import { FIXTURE_TIMESTAMP } from './people.js';
import { PROJECT_FIXTURES } from './projects.js';

/** Low-dim, deterministic embeddings so DAO tests are stable. */
const DIM = 4;

function unit(vec: readonly number[]): readonly number[] {
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export const VECTOR_FIXTURES: readonly Vector[] = PROJECT_FIXTURES.map((project, index) => ({
  id: `vector-${project.id}`,
  entityType: 'project',
  entityId: project.id,
  // Distinct one-hot-ish pattern per project so top-k has a stable ordering.
  embedding: unit([
    index % DIM === 0 ? 1 : 0,
    index % DIM === 1 ? 1 : 0,
    index % DIM === 2 ? 1 : 0,
    index % DIM === 3 ? 1 : 0,
  ]),
  dim: DIM,
  model: 'fixture-onehot',
  createdAt: FIXTURE_TIMESTAMP,
}));
