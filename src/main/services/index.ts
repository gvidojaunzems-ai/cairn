/**
 * Barrel for the main-process services.
 */
export { systemService } from './system.service.js';
export { createSetupService } from './setup.service.js';
export { createGitService } from './git.service.js';
export { createProjectsService } from './projects.service.js';
export { createTodayService } from './today.service.js';
export { createDailiesService } from './dailies.service.js';
export { createNewsService } from './news.service.js';
export { createSearchService } from './search.service.js';
export { createDocsService } from './docs.service.js';
export { createMeetingsService } from './meetings.service.js';
export { createReportsService } from './reports.service.js';
export { createPulseService } from './pulse.service.js';
export { createSupportService } from './support.service.js';
export { createSettingsService } from './settings.service.js';
export { createAiService } from './ai.service.js';
export {
  createJobsService,
  type JobsService,
  type JobManagerLike,
} from './jobs.service.js';
export {
  getServiceContext,
  resetServiceContextForTests,
  type ServiceContext,
} from './service-context.js';
