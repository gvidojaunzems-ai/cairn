/**
 * Barrel for the main-process service stubs. Every op namespace is
 * exported here so the router's registration table stays one import
 * line long.
 */
export { systemService } from './system.service.js';
export { setupService } from './setup.service.js';
export { gitService } from './git.service.js';
export { projectsService } from './projects.service.js';
export { todayService } from './today.service.js';
export { dailiesService } from './dailies.service.js';
export { newsService } from './news.service.js';
export { searchService } from './search.service.js';
export { docsService } from './docs.service.js';
export { meetingsService } from './meetings.service.js';
export { reportsService } from './reports.service.js';
export { pulseService } from './pulse.service.js';
export { supportService } from './support.service.js';
export { settingsService } from './settings.service.js';
export { aiService } from './ai.service.js';
export {
  jobsService,
  createJobsService,
  type JobsService,
  type JobManagerLike,
} from './jobs.service.js';
