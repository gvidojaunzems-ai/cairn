/**
 * Doc fixtures — S7 requires >= 1 row.
 */
import type { Doc } from '../../../contracts/domain-model.contract.js';

import { FIXTURE_TIMESTAMP } from './people.js';
import { POC_VECTOR_SEARCH_PROJECT_ID } from './projects.js';

export const DOC_FIXTURES: readonly Doc[] = [
  {
    id: 'doc-1',
    projectId: POC_VECTOR_SEARCH_PROJECT_ID,
    authorId: 'person-gvido',
    title: 'Vector index — design note',
    body: '# Vector index — design note\n\nDim=384, model=nomic-embed-text.\n',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'doc-2',
    authorId: 'person-lars',
    title: 'Onboarding — day one',
    body: '# Onboarding\n\nRead the HANDOFF, run `pnpm test`, and pair with someone.\n',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
] as const;
