/**
 * WIP-signal fixtures — S7 requires >= 1 row.
 */
import type { WipSignal } from '../../../contracts/domain-model.contract.js';

import { FIXTURE_TIMESTAMP } from './people.js';
import { POC_VECTOR_SEARCH_PROJECT_ID } from './projects.js';

export const WIP_SIGNAL_FIXTURES: readonly WipSignal[] = [
  {
    id: 'wip-1',
    projectId: POC_VECTOR_SEARCH_PROJECT_ID,
    personId: 'person-tom',
    title: 'branch feat/vector-search-dao advancing',
    status: 'new',
    detail: 'commit abc1234 — "wire vec0 DAO"',
    detectedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'wip-2',
    personId: 'person-gvido',
    title: 'onboarding docs draft in progress',
    status: 'acknowledged',
    detail: 'branch docs/onboarding, 3 commits ahead',
    detectedAt: FIXTURE_TIMESTAMP,
  },
] as const;
