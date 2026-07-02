/**
 * PoC project fixtures.
 *
 * Business rules:
 *   - Six named PoC projects referenced in spec §4.8. The exact names in the
 *     source-of-truth (`Cairn-Project-Spec.md`) are unavailable in-repo, so
 *     these are the best-inferred canonical set. Marked with a TODO so a
 *     later run can reconcile against the spec once it is available.
 *   - `poc-vector-search` MUST be present — a non-empty charter fixture
 *     ships against it (see `charters.ts`).
 */
import type { Project } from '../../../contracts/domain-model.contract.js';

import { FIXTURE_TIMESTAMP } from './people.js';

// TODO: reconcile the six PoC project names against
// `Cairn-Project-Spec.md` §4.8 once the spec lands in-repo.
export const PROJECT_FIXTURES: readonly Project[] = [
  {
    id: 'project-poc-vector-search',
    slug: 'poc-vector-search',
    name: 'PoC: Vector Search',
    status: 'active',
    summary:
      'Prototype local sqlite-vec index over squad knowledge with top-k retrieval.',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'project-poc-news-digest',
    slug: 'poc-news-digest',
    name: 'PoC: News Digest',
    status: 'discovery',
    summary: 'Cluster external news items into a daily squad digest.',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'project-poc-wip-radar',
    slug: 'poc-wip-radar',
    name: 'PoC: WIP Radar',
    status: 'active',
    summary: 'Surface work-in-progress across the squad from git activity.',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'project-poc-charter-gen',
    slug: 'poc-charter-gen',
    name: 'PoC: Charter Generator',
    status: 'paused',
    summary: 'Draft project charters from a template + AI summarisation.',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'project-poc-ticket-summariser',
    slug: 'poc-ticket-summariser',
    name: 'PoC: Ticket Summariser',
    status: 'blocked',
    summary: 'Weekly rollup of ticket status changes per squad member.',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'project-poc-knowledge-graph',
    slug: 'poc-knowledge-graph',
    name: 'PoC: Knowledge Graph',
    status: 'discovery',
    summary: 'Cross-link people, projects, and docs into a queryable graph.',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  },
] as const;

/** The project the poc-vector-search charter attaches to. */
export const POC_VECTOR_SEARCH_PROJECT_ID = 'project-poc-vector-search';
