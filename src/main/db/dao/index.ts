/**
 * DAO barrel export.
 *
 * Downstream consumers (service-API, seed runner) import DAO factories from
 * this module rather than reaching directly into individual files — that way
 * a rename or split within `dao/` stays a local refactor.
 */
export {
  createKnowledgeItemsDao,
  type KnowledgeItem,
  type KnowledgeItemsDao,
} from './knowledge-items.js';
export {
  createPeopleDao,
  type Person,
  type PersonStatus,
  type PeopleDao,
} from './people.js';
export {
  createProjectsDao,
  type Project,
  type ProjectStatus,
  type ProjectsDao,
} from './projects.js';
export {
  createChartersDao,
  type Charter,
  type ChartersDao,
} from './charters.js';
export {
  createNewsItemsDao,
  type NewsItem,
  type NewsItemsDao,
} from './news-items.js';
export {
  createDocsDao,
  type Doc,
  type DocsDao,
} from './docs.js';
export {
  createTicketsDao,
  type Ticket,
  type TicketStatus,
  type TicketsDao,
} from './tickets.js';
export {
  createWipSignalsDao,
  type WipSignal,
  type WipSignalStatus,
  type WipSignalsDao,
} from './wip-signals.js';
export {
  createVectorsDao,
  type VectorRecord,
  type VectorsDao,
  type TopKResult,
  type TopKOptions,
} from './vectors.js';
export {
  createJobsDao,
  type JobsDao,
  type InsertJobInput,
  type UpdateJobStatusInput,
  type UpdateJobProgressInput,
} from './jobs.js';
