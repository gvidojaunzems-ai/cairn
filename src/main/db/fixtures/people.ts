/**
 * Named-squad-member fixtures.
 *
 * Business rules:
 *   - Exactly five named people: Gvido, Lars, Maria, Priya, Tom. Order is
 *     stable (alphabetical) so downstream tests can index by position.
 *   - Timestamps are frozen to a known ISO-8601 instant to keep the seed
 *     deterministic — nothing about the fixture depends on wall-clock time.
 */
import type { Person } from '../../../contracts/domain-model.contract.js';

/** Frozen instant so seed runs are reproducible. */
export const FIXTURE_TIMESTAMP = '2026-07-02T00:00:00.000Z';

export const PEOPLE_FIXTURES: readonly Person[] = [
  {
    id: 'person-gvido',
    name: 'Gvido',
    handle: 'gvido',
    createdAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'person-lars',
    name: 'Lars',
    handle: 'lars',
    createdAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'person-maria',
    name: 'Maria',
    handle: 'maria',
    createdAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'person-priya',
    name: 'Priya',
    handle: 'priya',
    createdAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'person-tom',
    name: 'Tom',
    handle: 'tom',
    createdAt: FIXTURE_TIMESTAMP,
  },
] as const;
