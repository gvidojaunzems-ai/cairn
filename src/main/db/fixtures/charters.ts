/**
 * Charter fixtures.
 *
 * Business rules:
 *   - S7 requires a NON-EMPTY charter for the `poc-vector-search` project.
 *     The body below is a small but real Markdown charter — long enough that
 *     `body.trim().length > 0` and short enough that fixtures stay readable.
 */
import type { Charter } from '../../../contracts/domain-model.contract.js';

import { FIXTURE_TIMESTAMP } from './people.js';
import { POC_VECTOR_SEARCH_PROJECT_ID } from './projects.js';

const POC_VECTOR_SEARCH_BODY = `# Charter — PoC: Vector Search

## Problem
Squad members can't find prior art across the local knowledge base.

## Approach
Embed each knowledge item into a 384-dim vector, store in sqlite-vec, and
serve top-k (k=3) queries via a small DAO wrapper.

## Success criteria
- Cold-query < 100ms on a 1k-item corpus.
- Metadata filter by \`entity_type='project'\` returns only project vectors.
- No cloud calls at query time.
`;

export const CHARTER_FIXTURES: readonly Charter[] = [
  {
    id: 'charter-poc-vector-search',
    projectId: POC_VECTOR_SEARCH_PROJECT_ID,
    title: 'PoC: Vector Search — charter',
    body: POC_VECTOR_SEARCH_BODY,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
] as const;
