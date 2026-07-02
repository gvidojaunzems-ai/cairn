/**
 * High-level local store opener.
 */
import type Database from 'better-sqlite3';

import {
  createAppsDao,
  createChartersDao,
  createDecisionsDao,
  createDocsDao,
  createFeedsDao,
  createJobsDao,
  createKnowledgeItemsDao,
  createLocalReposDao,
  createMeetingsDao,
  createNewsItemsDao,
  createPeopleDao,
  createProjectsDao,
  createReportsDao,
  createTicketsDao,
  createUpdatesDao,
  createVectorsDao,
  createWipSignalsDao,
  type AppsDao,
  type ChartersDao,
  type DecisionsDao,
  type DocsDao,
  type FeedsDao,
  type JobsDao,
  type KnowledgeItemsDao,
  type LocalReposDao,
  type MeetingsDao,
  type NewsItemsDao,
  type PeopleDao,
  type ProjectsDao,
  type ReportsDao,
  type TicketsDao,
  type UpdatesDao,
  type VectorsDao,
  type WipSignalsDao,
} from './dao/index.js';
import { openDatabase, type OpenDatabaseOptions } from './connection.js';

export interface LocalStoreHandle {
  db: Database.Database;
  jobsDao: JobsDao;
  peopleDao: PeopleDao;
  projectsDao: ProjectsDao;
  chartersDao: ChartersDao;
  docsDao: DocsDao;
  newsItemsDao: NewsItemsDao;
  ticketsDao: TicketsDao;
  wipSignalsDao: WipSignalsDao;
  knowledgeItemsDao: KnowledgeItemsDao;
  vectorsDao: VectorsDao;
  updatesDao: UpdatesDao;
  decisionsDao: DecisionsDao;
  appsDao: AppsDao;
  meetingsDao: MeetingsDao;
  reportsDao: ReportsDao;
  feedsDao: FeedsDao;
  localReposDao: LocalReposDao;
  close(): void;
}

export type OpenStoreOptions = OpenDatabaseOptions;

export function openStore(options: OpenStoreOptions = {}): LocalStoreHandle {
  const db = openDatabase(options);
  const jobsDao = createJobsDao(db);
  const peopleDao = createPeopleDao(db);
  const projectsDao = createProjectsDao(db);
  const chartersDao = createChartersDao(db);
  const docsDao = createDocsDao(db);
  const newsItemsDao = createNewsItemsDao(db);
  const ticketsDao = createTicketsDao(db);
  const wipSignalsDao = createWipSignalsDao(db);
  const knowledgeItemsDao = createKnowledgeItemsDao(db);
  const vectorsDao = createVectorsDao(db);
  const updatesDao = createUpdatesDao(db);
  const decisionsDao = createDecisionsDao(db);
  const appsDao = createAppsDao(db);
  const meetingsDao = createMeetingsDao(db);
  const reportsDao = createReportsDao(db);
  const feedsDao = createFeedsDao(db);
  const localReposDao = createLocalReposDao(db);

  let closed = false;
  return {
    db,
    jobsDao,
    peopleDao,
    projectsDao,
    chartersDao,
    docsDao,
    newsItemsDao,
    ticketsDao,
    wipSignalsDao,
    knowledgeItemsDao,
    vectorsDao,
    updatesDao,
    decisionsDao,
    appsDao,
    meetingsDao,
    reportsDao,
    feedsDao,
    localReposDao,
    close(): void {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
