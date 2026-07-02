/**
 * DAO barrel export.
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
export { createUpdatesDao, type Update, type UpdatesDao } from './updates.js';
export { createDecisionsDao, type Decision, type DecisionStatus, type DecisionsDao } from './decisions.js';
export { createAppsDao, type App, type AppsDao } from './apps.js';
export {
  createMeetingsDao,
  type Meeting,
  type ActionItem,
  type ActionItemStatus,
  type MeetingsDao,
} from './meetings.js';
export { createReportsDao, type Report, type ReportsDao } from './reports.js';
export { createFeedsDao, type Feed, type FeedsDao } from './feeds.js';
export { createLocalReposDao, type LocalRepo, type LocalReposDao } from './local-repos.js';
export { createSettingsKvDao, type SettingsKvDao } from './settings-kv.js';
