/**
 * Fixture barrel — exposes the canonical fixture data + FixtureSeedRunner.
 */
export { PEOPLE_FIXTURES, FIXTURE_TIMESTAMP } from './people.js';
export { PROJECT_FIXTURES, POC_VECTOR_SEARCH_PROJECT_ID } from './projects.js';
export { CHARTER_FIXTURES } from './charters.js';
export { DOC_FIXTURES } from './docs.js';
export { TICKET_FIXTURES } from './tickets.js';
export { WIP_SIGNAL_FIXTURES } from './wip-signals.js';
export { NEWS_ITEM_FIXTURES } from './news-items.js';
export { VECTOR_FIXTURES } from './vectors.js';
export {
  FixtureSeedRunner,
  seedFixtures,
} from './fixture-runner.js';
export type { FixtureDao, FixtureRunnerOptions } from './fixture-runner.js';
