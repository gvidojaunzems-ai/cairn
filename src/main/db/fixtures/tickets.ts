/**
 * Ticket fixtures — S7 requires >= 1 row.
 */
import type { Ticket } from '../../../contracts/domain-model.contract.js';

import { FIXTURE_TIMESTAMP } from './people.js';
import { POC_VECTOR_SEARCH_PROJECT_ID } from './projects.js';

export const TICKET_FIXTURES: readonly Ticket[] = [
  {
    id: 'ticket-1',
    projectId: POC_VECTOR_SEARCH_PROJECT_ID,
    assigneeId: 'person-maria',
    title: 'Wire top-k(k=3) query into UI',
    status: 'in_progress',
    body: 'Add a search bar that dispatches to the vector DAO with k=3.',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'ticket-2',
    projectId: POC_VECTOR_SEARCH_PROJECT_ID,
    assigneeId: 'person-priya',
    title: 'Benchmark vec0 metadata filter',
    status: 'open',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
] as const;
